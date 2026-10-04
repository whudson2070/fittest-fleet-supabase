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
    'Walk one mile',
    'Jog 5 kilometers',
    'Consume less than 1,200 calories',
    'Drink two liters of water',
    'Achieve 100 pushups by the end of the day',
    'Meditate in silence for thirty minutes',
    'Take a 20-minute walk after each meal',
    'Complete 50 bodyweight squats',
    'Hold a plank for three minutes total',
    'Skip added sugar for the entire day',
    'Eat five servings of vegetables',
    'Take the stairs instead of the elevator all day',
    'Finish a 30-minute strength session',
    'Stretch for fifteen minutes',
    'Skip late-night snacks after dinner',
    'Walk or bike every trip under one mile',
    'Log every meal before you eat it',
    'Do 20 burpees before noon',
    'Replace one sugary drink with water',
    'Complete a 15-minute HIIT circuit',
    'Reach 8,000 steps before dinner',
    'Prep tomorrow’s meals tonight',
    'Do 100 jumping jacks across the day',
    'Include a protein source with every meal',
    'Take a brisk 45-minute walk outdoors',
    'Do three sets of lunges on each leg',
    'Choose whole foods instead of processed snacks',
    'Spend ten minutes on mobility work',
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

  function challengeForDate(date) {
    var index = dayIndex(date || new Date());
    var i = ((index % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length;
    return CHALLENGES[i];
  }

  function render(date) {
    var el = document.getElementById('daily-challenge-text');
    if (!el) return;
    el.textContent = challengeForDate(date);
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
    dayIndex: dayIndex,
    render: render,
  };
})(window);
