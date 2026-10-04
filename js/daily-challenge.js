/**
 * Today's Challenge for the Community Encouragement Hub.
 * Picks one objective from a fixed list using the calendar date in
 * America/New_York, so every visitor sees the same challenge and it
 * rolls over at local midnight. No network calls.
 */
(function (global) {
  'use strict';

  var TIME_ZONE = 'America/New_York';

  var CHALLENGES = [
    {
      challenge: 'Choose one realistic weight-loss habit to practice today',
      encouragement: 'A sustainable weight-loss journey grows from one realistic habit repeated with patience.',
      pillar: 'Sustainable Weight Loss',
    },
    {
      challenge: 'Jog for 5 kilometers at a purposeful, steady pace',
      encouragement: 'Every steady kilometer builds purposeful movement and confidence in what your body can do.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Build a balanced plate at each meal today',
      encouragement: 'Balanced plates make nutritional discipline practical, satisfying, and easier to repeat.',
      pillar: 'Nutritional Discipline',
    },
    {
      challenge: 'Drink water regularly throughout the day',
      encouragement: 'Consistent hydration is a simple act of nutritional discipline that supports your daily energy.',
      pillar: 'Nutritional Discipline',
    },
    {
      challenge: 'Complete 100 pushups in manageable sets',
      encouragement: 'Break the work into manageable sets—purposeful movement gets stronger through steady practice.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Record one non-scale win and one weight-loss habit you want to repeat',
      encouragement: 'Noticing progress beyond the scale keeps sustainable weight loss grounded in habits and self-trust.',
      pillar: 'Sustainable Weight Loss',
    },
    {
      challenge: 'Take a 20-minute walk after each meal',
      encouragement: 'A purposeful walk after each meal adds intentional movement to a routine you can sustain.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Complete 50 bodyweight squats with controlled form',
      encouragement: 'Each controlled repetition makes purposeful movement a little stronger and more confident.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Hold a plank for three minutes total',
      encouragement: 'Steady breathing and focused effort turn this purposeful movement into meaningful core strength.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Skip added sugar for the entire day',
      encouragement: 'Choosing foods with intention is nutritional discipline that supports your goals without extremes.',
      pillar: 'Nutritional Discipline',
    },
    {
      challenge: 'Eat five servings of vegetables today',
      encouragement: 'Colorful produce makes nutritional discipline delicious, practical, and full of nourishment.',
      pillar: 'Nutritional Discipline',
    },
    {
      challenge: 'Take the stairs instead of the elevator today',
      encouragement: 'Each flight is a purposeful movement win that adds up across your day.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Finish a 30-minute strength session',
      encouragement: 'Thirty focused minutes of purposeful movement can build strength and momentum.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Stretch for fifteen mindful minutes',
      encouragement: 'A few focused minutes of purposeful movement help your body move with more freedom.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Track your evening hunger and fullness cues after dinner',
      encouragement: 'Awareness at dinner supports sustainable weight loss by helping you respond to your body with care.',
      pillar: 'Sustainable Weight Loss',
    },
    {
      challenge: 'Walk or bike every trip under one mile',
      encouragement: 'Turning short trips into purposeful movement makes active living part of your normal routine.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Log each meal before you eat it',
      encouragement: 'A moment of awareness before eating keeps sustainable weight loss focused on helpful habits, not perfection.',
      pillar: 'Sustainable Weight Loss',
    },
    {
      challenge: 'Do 20 burpees before noon',
      encouragement: 'Start with purposeful movement and let that early effort set a strong tone for the day.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Replace one sugary drink with water',
      encouragement: 'One thoughtful beverage swap is nutritional discipline you can practice again tomorrow.',
      pillar: 'Nutritional Discipline',
    },
    {
      challenge: 'Complete a 15-minute HIIT circuit at your own pace',
      encouragement: 'Focused intervals make purposeful movement adaptable, energizing, and worth showing up for.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Reach 8,000 steps before dinner',
      encouragement: 'Small bursts of purposeful movement add up and bring you closer to your daily goal.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Prep tomorrow’s balanced meals tonight',
      encouragement: 'Preparing balanced meals turns nutritional discipline into an easier choice tomorrow.',
      pillar: 'Nutritional Discipline',
    },
    {
      challenge: 'Do 100 jumping jacks across the day',
      encouragement: 'Spread the reps out and let each burst of purposeful movement lift your energy.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Include a protein source with every meal',
      encouragement: 'Balanced, satisfying meals make nutritional discipline easier to maintain all day.',
      pillar: 'Nutritional Discipline',
    },
    {
      challenge: 'Take a brisk 45-minute walk outdoors',
      encouragement: 'Enjoy the fresh air while purposeful movement builds endurance one brisk minute at a time.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Do three sets of lunges on each leg',
      encouragement: 'Strong, steady lunges make purposeful movement a practice you can build on.',
      pillar: 'Purposeful Movement',
    },
    {
      challenge: 'Choose whole foods instead of processed snacks today',
      encouragement: 'Choosing nourishing foods is nutritional discipline that helps you feel cared for and fueled.',
      pillar: 'Nutritional Discipline',
    },
    {
      challenge: 'Spend ten minutes on mobility work',
      encouragement: 'Ten thoughtful minutes of purposeful movement can help your body move with more freedom.',
      pillar: 'Purposeful Movement',
    },
  ];

  function zoneParts(date) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);
    var map = {};
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type !== 'literal') map[parts[i].type] = parts[i].value;
    }
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour) % 24,
      minute: Number(map.minute),
      second: Number(map.second),
    };
  }

  /** Minutes to add to a UTC reading of the wall clock to get the real instant. */
  function offsetMinutes(date) {
    var p = zoneParts(date);
    var asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((asUtc - date.getTime()) / 60000);
  }

  /** Whole days since Unix epoch for the America/New_York calendar date. */
  function dayIndex(date) {
    var p = zoneParts(date || new Date());
    return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86400000);
  }

  function itemForDate(date) {
    var index = dayIndex(date || new Date());
    var i = ((index % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length;
    return CHALLENGES[i];
  }

  function challengeForDate(date) {
    return itemForDate(date).challenge;
  }

  function encouragementForDate(date) {
    return itemForDate(date).encouragement;
  }

  function pillarForDate(date) {
    return itemForDate(date).pillar;
  }

  function render(date) {
    var item = itemForDate(date);
    var el = document.getElementById('daily-challenge-text');
    var pillarEl = document.getElementById('daily-challenge-pillar');
    var encouragementEl = document.getElementById('daily-challenge-encouragement');
    if (!el) return;
    el.textContent = item.challenge;
    if (pillarEl) {
      pillarEl.textContent = item.pillar;
      if (pillarEl.tagName === 'A') {
        var pages = {
          'Sustainable Weight Loss': 'sustainable-weight-loss/',
          'Purposeful Movement': 'purposeful-movement/',
          'Nutritional Discipline': 'nutritional-discipline/'
        };
        pillarEl.setAttribute('href', pages[item.pillar] || 'index.html#pillars');
      }
    }
    if (encouragementEl) encouragementEl.textContent = item.encouragement;
  }

  function msUntilNextNewYorkMidnight(now) {
    var p = zoneParts(now);
    var offset = offsetMinutes(now);
    var todayMidnight = Date.UTC(p.year, p.month - 1, p.day) - offset * 60000;
    var next = todayMidnight + 86400000;
    var offsetAtNext = offsetMinutes(new Date(next));
    if (offsetAtNext !== offset) {
      next = Date.UTC(p.year, p.month - 1, p.day + 1) - offsetAtNext * 60000;
    }
    var wait = next - now.getTime();
    if (wait < 1000) wait = 1000;
    return wait;
  }

  function scheduleMidnightRefresh() {
    var wait = msUntilNextNewYorkMidnight(new Date());
    global.setTimeout(function () {
      render(new Date());
      scheduleMidnightRefresh();
    }, wait);
  }

  render(new Date());
  scheduleMidnightRefresh();

  global.FFDailyChallenge = {
    CHALLENGES: CHALLENGES,
    challengeForDate: challengeForDate,
    encouragementForDate: encouragementForDate,
    pillarForDate: pillarForDate,
    dayIndex: dayIndex,
    render: render,
  };
})(window);
