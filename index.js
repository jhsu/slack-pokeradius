var fetch = require('node-fetch');
var Botkit = require('botkit');
var controller = Botkit.slackbot();

var token = process.env.token;
var url = process.env.url;

if (!token) {
  throw new Error('token env variable must be set');
}

var bot = controller.spawn({
  token: token
});

// TODO: keep track of encounters per room
var notifyingRooms = {};
var encounters = {};

var addMessage = /pokeradius watch/;
var removeMessage = /pokeradius unwatch/;

controller.on('direct_message', function(bot, message) {
  console.log('direct_message ', message);
});

controller.on('message', function(bot, message) {
  console.log('message ', message);
});

controller.hears(['pokeradius watch'], 'direct_message,direct_mention,mention,message', function(bot, message) {
  notifyingRooms[message.channel] = {};
  bot.reply(message, 'watching');
});


controller.on('message_received', function(bot, message) {
  // {
  //   "type": "message",
  //   "channel": "C2147483705",
  //   "user": "U2147483697",
  //   "text": "Hello world",
  //   "ts": "1355517523.000005"
  // }
  console.log('message_received ', message);
  if (message.type === 'message') {
    if (addMessage.test(message.text)) {
      console.log('added to notifications ', message.channel);
      notifyingRooms[message.channel] = new Date();
      bot.replyPublic(message, 'Added channel to pokeradius notifications');
    } else if (removeMessage.test(message.text)) {
      console.log('removed from notifications ', message.channel);
      delete notifyingRooms[message.channel];
      bot.replyPublic(message, 'Removed channel to pokeradius notifications');
    }
  }

  // bot.api.users.info({user: message.user}, function(info) {
  //   // do something
  // });
});

// fetch nearby pokemon
function fetchNearby(cb) {
  fetch(url)
  .then(function(res) {
    return res.json();
  }).then(function(json) {
    cb(json);
  });
}

bot.startRTM(function(err, bot, payload) {
  function handleResult(response) {
    var newEncounters = [];
    response.nearby.forEach(function(enc) {
      if (!encounters[enc.id]) {
        encounters[enc.id] = enc;
        newEncounters.push(enc);
      }
    });
    newEncounters = newEncounters.filter(function(enc) {
      return enc.distance < 300;
    }).map(function(enc) {
      return [enc.name, enc.direction, enc.distance, new Date(enc.disappear_time).toString()].join(' ');
    });

    if (newEncounters.length) {
      console.log(newEncounters.join("\n"));
      Object.keys(notifyingRooms).forEach(function(channelId) {
        bot.sendWebhook({
          text: newEncounters.join("\n"),
          channel: channelId,
        });
      });
    }

    setTimeout(function() {
      fetchNearby(handleResult);
    }, 2000);
  }

  fetchNearby(handleResult);
});
