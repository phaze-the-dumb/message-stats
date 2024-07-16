import djs from 'discord.js';
import Fastify from 'fastify';
import fs from 'fs';
import 'dotenv/config';
import mongoose from 'mongoose';

import users from './db/user';

const fastify = Fastify();

let getNextReset = (): number => {
  let d = new Date();

  d.setDate(1);

  if(d.getMonth() >= 11)
    d.setMonth(0);
  else
    d.setMonth(d.getMonth() + 1);

  d.setMilliseconds(0);
  d.setSeconds(0);
  d.setMinutes(0);
  d.setHours(0);

  return d.getTime();
}

let resetUserScores = async () => {
  let nextReset = getNextReset();

  fs.writeFileSync('reset.txt', getNextReset().toString());
  savedReset = nextReset;

  let user = await users.find().sort({ messageCreateCount: -1 }).limit(1).exec();

  if(!user[0].wins){
    user[0].wins = 1;
  } else{
    user[0].wins += 1;
  }

  await user[0].save();

  (await users.find()).forEach(user => {
    user.messageCreateCount = 0;
    user.messageDeleteCount = 0;
    user.messageEditCount = 0;

    user.save();
  })
}

if(!fs.existsSync('reset.txt'))
  fs.writeFileSync('reset.txt', getNextReset().toString());

let savedReset = parseInt(fs.readFileSync('reset.txt', 'utf-8'));

mongoose.connect(process.env.MONGODB!)
  .then(() => console.log("Connected to DB"));

let client = new djs.Client({ intents: [
  djs.IntentsBitField.Flags.GuildMembers,
  djs.IntentsBitField.Flags.GuildMessages,
  djs.IntentsBitField.Flags.MessageContent,
  djs.IntentsBitField.Flags.Guilds
] });

client.on('ready', () => {
  console.log('Logged in as ' + client.user?.displayName);
})

client.on('messageCreate', async ( msg ) => {
  if(msg.guildId !== process.env.SERVER_ID || msg.author.bot)
    return;

  if(msg.createdTimestamp >= savedReset){
    resetUserScores();
  }

  let user = await users.findById(msg.author.id);
  if(!user){
    await users.create({
      _id: msg.author.id,
      avatar: msg.author.avatar,
      username: msg.author.displayName,

      messageCreateCount: 1,
      messageDeleteCount: 0,
      messageEditCount: 0,

      wins: 0
    });
  } else{
    user.messageCreateCount! += 1;

    user.avatar = msg.author.avatar;
    user.username = msg.author.displayName;

    user.save();
  }
})

client.on('messageDelete', async ( msg ) => {
  if(msg.guildId !== process.env.SERVER_ID)return;

  if(Date.now() >= savedReset){
    resetUserScores();
  }

  let user = await users.findById(msg.author?.id);
  if(!user)return;

  user.messageDeleteCount! += 1;
  user.save();
})

client.on('messageUpdate', async ( msg ) => {
  if(msg.guildId !== process.env.SERVER_ID)return;

  if(Date.now() >= savedReset){
    resetUserScores();
  }

  let user = await users.findById(msg.author?.id);
  if(!user)return;

  user.messageEditCount! += 1;
  user.save();
})

fastify.options('/api/v1/user', ( _req, reply ) => {
  reply.header("access-control-allow-origin", "https://qsup.phaz.uk");
  reply.send('200 OK');
})

fastify.get<{ Querystring: { uid: string } }>('/api/v1/user', async ( req, reply ) => {
  if(Date.now() >= savedReset){
    resetUserScores();
  }

  let uid = req.query.uid;
  if(!uid)return reply.send({ ok: false, error: 'No user id provided' });

  let user = await users.findById(uid);

  reply.header("access-control-allow-origin", "https://qsup.phaz.uk");
  reply.send(user);
})

fastify.options('/api/v1/board', ( _req, reply ) => {
  reply.header("access-control-allow-origin", "https://qsup.phaz.uk");
  reply.send('200 OK');
})

fastify.get<{ Querystring: { page?: number } }>('/api/v1/board', async ( req, reply ) => {
  if(Date.now() >= savedReset){
    resetUserScores();
  }

  let page = req.query.page || 0;
  let usersList = await users.find().sort({ messageCreateCount: -1 }).skip(page * 15).limit(15).exec();

  reply.header("access-control-allow-origin", "https://qsup.phaz.uk");
  reply.send(usersList);
})

fastify.options('/api/v1/reset', ( _req, reply ) => {
  reply.header("access-control-allow-origin", "https://qsup.phaz.uk");
  reply.send('200 OK');
})

fastify.get('/api/v1/reset', async ( req, reply ) => {
  if(Date.now() >= savedReset){
    resetUserScores();
  }

  reply.header("access-control-allow-origin", "https://qsup.phaz.uk");
  reply.send({ reset: savedReset });
})

client.login(process.env.TOKEN);
fastify.listen({ port: 7005, host: '0.0.0.0' });