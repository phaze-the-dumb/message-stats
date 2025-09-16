import djs from 'discord.js';
import Fastify, { FastifyRequest } from 'fastify';
import fs from 'fs';
import 'dotenv/config';
import mongoose from 'mongoose';
import crypto from 'crypto';
import websockets, { WebSocket } from '@fastify/websocket';

import users from './db/user';

const fastify = Fastify({ logger: { level: 'error' } });

fastify.register(websockets);

class Listener{
  id: string;
  socket: WebSocket;

  constructor(sock: WebSocket){
    this.socket = sock;
    this.id = crypto.randomUUID();
  }
}

let listeners: Listener[] = [];

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

  let user = await users.find().sort({ typedCharacterCount: -1 }).limit(1).exec();

  if(!user[0].wins){
    user[0].wins = 1;
  } else{
    user[0].wins += 1;
  }

  await user[0].save();

  await users.updateMany({}, { $set: {
    messageCreateCount: 0,
    messageDeleteCount: 0,
    messageEditCount: 0,
    typedCharacterCount: 0,
    words: []
  } });
}

if(!fs.existsSync('reset.txt'))
  fs.writeFileSync('reset.txt', getNextReset().toString());

let savedReset = parseInt(fs.readFileSync('reset.txt', 'utf-8'));

let getCharactersInMessage = ( content: string ): number => {
  let count = 0;
  for (let i = 0; i < content.length; i++) {
    let code = content.charCodeAt(i);

    if(code >= 32 && code <= 126)
      count++;
  }

  return count;
}

let getWordsInMessage = ( content: string ): Array<{ word: string, uses: number }> => {
  let words = content.split(' ');
  let worms: Array<{ word: string, uses: number }> = [];

  words.forEach(word => {
    if(word === "") return;
    let worm = worms.find(x => x.word === word);
    if(worm)
      worm.uses++;
    else
      worms.push({ word: word, uses: 1 });
  });

  return worms;
}

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

      typedCharacterCount: getCharactersInMessage(msg.content),
      words: getWordsInMessage(msg.content),

      wins: 0
    });

    listeners.forEach(l => l.socket.send("1|CREATE|" + msg.author!.id));
    listeners.forEach(l => l.socket.send(msg.content.length + "|TYPED|" + msg.author!.id));
  } else{
    if(!user.typedCharacterCount)
      user.typedCharacterCount = 0;

    user.messageCreateCount! += 1;
    user.typedCharacterCount += getCharactersInMessage(msg.content);

    user.avatar = msg.author.avatar;
    user.username = msg.author.displayName;

    let words = getWordsInMessage(msg.content);
    words.forEach(word => {
      let worm = user.words.find(x => x.word === word.word);
      if(worm)
        worm.uses! += word.uses;
      else
        user.words.push(word);
    })

    user.save();

    listeners.forEach(l => l.socket.send(user.messageCreateCount + "|CREATE|" + msg.author!.id));
    listeners.forEach(l => l.socket.send(user.typedCharacterCount + "|TYPED|" + msg.author!.id));
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

  listeners.forEach(l => l.socket.send(user.messageDeleteCount + "|DELETE|" + msg.author!.id));
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

  listeners.forEach(l => l.socket.send(user.messageEditCount + "|EDIT|" + msg.author!.id));
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
  let usersList = await users.find().sort({ typedCharacterCount: -1 }).skip(page * 15).limit(15).exec();

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

fastify.register(async (fastify) => {
  fastify.options('/api/v1/live', ( _req, reply ) => {
    reply.header("access-control-allow-origin", "https://qsup.phaz.uk");
    reply.send('200 OK');
  });

  fastify.get('/api/v1/live', { websocket: true }, async ( socket: WebSocket, req: FastifyRequest ) => {
    let listener = new Listener(socket);
    listeners.push(listener);

    socket.on('close', () => {
      listeners = listeners.filter(x => x.id !== listener.id);
    });
  });
});

client.login(process.env.TOKEN);
fastify.listen({ port: 7005, host: '0.0.0.0' });