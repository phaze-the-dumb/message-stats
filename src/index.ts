import djs from 'discord.js';
import 'dotenv/config';

import mongoose from 'mongoose';

import users from './db/user';

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

  let user = await users.findById(msg.author.id);
  if(!user){
    await users.create({
      _id: msg.author.id,
      avatar: msg.author.avatar,
      username: msg.author.displayName,

      messageCreateCount: 1,
      messageDeleteCount: 0,
      messageEditCount: 0
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

  let user = await users.findById(msg.author?.id);
  if(!user)return;

  user.messageDeleteCount! += 1;
  user.save();
})

client.on('messageUpdate', async ( msg ) => {
  if(msg.guildId !== process.env.SERVER_ID)return;

  let user = await users.findById(msg.author?.id);
  if(!user)return;

  user.messageEditCount! += 1;
  user.save();
})

client.login(process.env.TOKEN);