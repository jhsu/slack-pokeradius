var fetch = require('node-fetch');
var Botkit = require('botkit');
var controller = Botkit.slackbot();
var ivCalculator = require('pokemon-go-iv-calculator');

var token = process.env.token;
var url = process.env.url;

if (!token) {
  throw new Error('token env variable must be set');
}

var bot = controller.spawn({
  token: token
});

// TODO: keep track of encounters per room
var notifyingRooms = {
};
var encounters = {};

var addMessage = /pokeradius watch/;
var removeMessage = /pokeradius unwatch/;
var excludeList = /exclude ([0-9,\s]+)/;
var includeList = /include ([0-9,\s]+)/;
var askConfig = /pokeradius config/;
var ivcheck = /ivcheck (\w+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)/;

function channelSubscribed(channelId) {
  return !!notifyingRooms[channelId];
}

function getChannelConfig(id) {
  return notifyingRooms[id] || {excludes: {16: true, 41: true, 10: true}};
};

controller.on('ambient', function(bot, message) {
  if (message.type === 'message') {
    if (addMessage.test(message.text)) {
      console.log('added to notifications ', message.channel);
      notifyingRooms[message.channel] = {excludes: {}};
      bot.reply(message, 'Added channel to pokeradius notifications');

    } else if (removeMessage.test(message.text)) {
      console.log('removed from notifications ', message.channel);
      delete notifyingRooms[message.channel];
      bot.reply(message, 'Removed channel to pokeradius notifications');

    } else if (excludeList.test(message.text)) {
      if (!channelSubscribed(message.channel)) {
        return;
      }
      var config = getChannelConfig(message.channel);
      var ids = message.text.match(excludeList)[1].split(',').forEach(function(id) {
        config.excludes[parseInt(id)] = true;
      });
      notifyingRooms[message.channel] = config;
      bot.reply(message, 'excluding: ' + Object.keys(config.excludes).join(', '));
    } else if (includeList.test(message.text)) {
      if (!channelSubscribed(message.channel)) {
        return;
      }
      var config = getChannelConfig(message.channel);
      var ids = message.text.match(includeList)[1].split(',').forEach(function(id) {
        delete config.excludes[parseInt(id)];
      });
      notifyingRooms[message.channel] = config;
      bot.reply(message, 'excluding: ' + Object.keys(config.excludes).join(', '));
    } else if (askConfig.test(message.text)) {
      var config = getChannelConfig(message.channel);
      bot.reply(message, JSON.stringify(config));
    } else if (ivcheck.test(message.text)) {
      var match = message.text.match(ivcheck);
      var name = match[1];
      var cp = match[2];
      var hp = match[3];
      var dust = match[4];
      var results = ivCalculator.evaluate(name, parseInt(cp), parseInt(hp), parseInt(dust));
      var percents = results.ivs.map(function(iv) {
        return iv.perfection * 100;
      });
      bot.reply(message, 'possible iv percents: ' + percents.join(', '));
    }
  }
});

// fetch nearby pokemon
function fetchNearby(cb) {
  console.log('fetchinng... ');
  fetch(url)
  .then(function(res) {
    return res.json();
  }).then(function(json) {
    console.log('resolved');
    cb(json);
  }).catch(function(e) {
    console.error(e);
  });
}

function getKeyFor(enc) {
  return enc.id + "-" + enc.spawn_point_id;
};

bot.startRTM(function(err, bot, payload) {
  function handleResult(response) {
    var newEncounters = [];
    response.nearby.forEach(function(enc) {
      var key = getKeyFor(enc);
      if (!encounters[key]) {
        encounters[key] = enc;
        newEncounters.push(enc);
      }
    });
    newEncounters = newEncounters.filter(function(enc) {
      return enc.distance < 300;
    });

    console.log('new encounters ', newEncounters.length);
    if (newEncounters.length) {
      Object.keys(notifyingRooms).forEach(function(channelId) {
        console.log('notifying channel ', channelId);
        var config = getChannelConfig(channelId);

        var notifications = newEncounters.filter(function(enc) {
          if (config.excludes[enc.pokemon_id]) {
            console.log('ignoring ', enc.pokemon_id);
          }
          return !config.excludes[enc.pokemon_id];
        }).map(function(enc) {
          return [enc.name, "#"+enc.pokemon_id, enc.direction, enc.distance + "m", new Date(enc.disappear_time).toString()].join(' ');
        });
        console.log(notifications.join("\n"));

        try {
          bot.send({
            text: notifications.join("\n"),
            channel: channelId,
          });
        } catch(e) {
          console.error(e);
        }
      });
    }

    setTimeout(function() {
      fetchNearby(handleResult);
    }, 5000);
  }

  fetchNearby(handleResult);
});
