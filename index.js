const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;

const config = require('./settings.json');
const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('Bot has arrived');
});

app.listen(8000, () => {
  console.log('Server started');
});

function createBot() {
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  let pendingPromise = Promise.resolve();

  // --- FIXED AUTH FUNCTIONS ---
  function sendRegister(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`);
      console.log(`[Auth] Sent /register command.`);

      const listener = (msg) => {
        const message = msg.toString();
        console.log(`[Server] ${message}`);

        if (message.includes('successfully registered')) {
          console.log('[INFO] Registration confirmed.');
          bot.removeListener('messagestr', listener);
          resolve();
        } else if (message.includes('already registered')) {
          console.log('[INFO] Bot was already registered.');
          bot.removeListener('messagestr', listener);
          resolve();
        } else if (message.includes('Invalid command')) {
          bot.removeListener('messagestr', listener);
          reject(`Registration failed: Invalid command. Message: "${message}"`);
        }
      };

      bot.on('messagestr', listener);
    });
  }

  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`);
      console.log(`[Auth] Sent /login command.`);

      const listener = (msg) => {
        const message = msg.toString();
        console.log(`[Server] ${message}`);

        if (message.includes('successfully logged in')) {
          console.log('[INFO] Login successful.');
          bot.removeListener('messagestr', listener);
          resolve();
        } else if (message.includes('Invalid password')) {
          bot.removeListener('messagestr', listener);
          reject(`Login failed: Invalid password. Message: "${message}"`);
        } else if (message.includes('not registered')) {
          bot.removeListener('messagestr', listener);
          reject(`Login failed: Not registered. Message: "${message}"`);
        }
      };

      bot.on('messagestr', listener);
    });
  }

  // --- ON SPAWN ---
  bot.once('spawn', () => {
    console.log('\x1b[33m[AfkBot] Bot joined the server', '\x1b[0m');

    if (config.utils['auto-auth'].enabled) {
      console.log('[INFO] Started auto-auth module');

      const password = config.utils['auto-auth'].password;

      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(error => console.error('[ERROR]', error));
    }

    if (config.utils['chat-messages'].enabled) {
      console.log('[INFO] Started chat-messages module');
      const messages = config.utils['chat-messages']['messages'];

      if (config.utils['chat-messages'].repeat) {
        const delay = config.utils['chat-messages']['repeat-delay'];
        let i = 0;

        setInterval(() => {
          bot.chat(`${messages[i]}`);

          if (i + 1 === messages.length) {
            i = 0;
          } else {
            i++;
          }
        }, delay * 1000);
      } else {
        messages.forEach((msg) => {
          bot.chat(msg);
        });
      }
    }

    const pos = config.position;

    if (config.position.enabled) {
      console.log(
        `\x1b[32m[Afk Bot] Starting to move to target location (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`
      );
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    if (config.utils['anti-afk'].enabled) {
      console.log('[INFO] Started anti-afk module');

      // Random wandering system
      setInterval(() => {
        let x = bot.entity.position.x + (Math.random() * 10 - 5); // random offset -5 to +5
        let y = bot.entity.position.y;
        let z = bot.entity.position.z + (Math.random() * 10 - 5);

        bot.pathfinder.setMovements(defaultMove);
        bot.pathfinder.setGoal(new GoalBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
      }, 15000); // every 15s pick a new random position

      // Sneak toggle
      if (config.utils['anti-afk'].sneak) {
        setInterval(() => {
          bot.setControlState('sneak', true);
          setTimeout(() => bot.setControlState('sneak', false), 2000);
        }, 30000);
      }

      // Jump every few seconds (looks more human)
      setInterval(() => {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
      }, 20000);
    }
  });

  bot.on('goal_reached', () => {
    console.log(
      `\x1b[32m[AfkBot] Bot arrived at the target location. ${bot.entity.position}\x1b[0m`
    );
  });

  bot.on('death', () => {
    console.log(
      `\x1b[33m[AfkBot] Bot has died and was respawned at ${bot.entity.position}`,
      '\x1b[0m'
    );
  });

  if (config.utils['auto-reconnect']) {
    bot.on('end', () => {
      setTimeout(() => {
        createBot();
      }, config.utils['auto-recconect-delay']);
    });
  }

  bot.on('kicked', (reason) =>
    console.log(
      '\x1b[33m',
      `[AfkBot] Bot was kicked from the server. Reason: \n${reason}`,
      '\x1b[0m'
    )
  );

  bot.on('error', (err) =>
    console.log(`\x1b[31m[ERROR] ${err.message}`, '\x1b[0m')
  );
}

createBot();
