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
    { challenge: 'Walk one mile', encouragement: 'Every mile starts with one determined step—keep going!' },
    { challenge: 'Jog 5 kilometers', encouragement: 'Set your pace, trust your training, and celebrate every finish line.' },
    { challenge: 'Consume less than 1,200 calories', encouragement: 'Practice mindful portions and nourish yourself with care today.' },
    { challenge: 'Drink two liters of water', encouragement: 'Each glass is a refreshing vote for your energy and well-being.' },
    { challenge: 'Achieve 100 pushups by the end of the day', encouragement: 'Break them into manageable sets—steady effort builds real strength.' },
    { challenge: 'Meditate in silence for thirty minutes', encouragement: 'Give your mind room to breathe; this quiet time is a gift to yourself.' },
    { challenge: 'Take a 20-minute walk after each meal', encouragement: 'A little movement after each meal adds up to a powerful daily habit.' },
    { challenge: 'Complete 50 bodyweight squats', encouragement: 'Your legs grow stronger with every rep—show up for yourself.' },
    { challenge: 'Hold a plank for three minutes total', encouragement: 'Find your steady breath and let each second strengthen your core.' },
    { challenge: 'Skip added sugar for the entire day', encouragement: 'Your intentional choices today are building lasting momentum.' },
    { challenge: 'Eat five servings of vegetables', encouragement: 'Add color to your plate and give your body the fuel it deserves.' },
    { challenge: 'Take the stairs instead of the elevator all day', encouragement: 'Each flight is a small victory that makes you stronger.' },
    { challenge: 'Finish a 30-minute strength session', encouragement: 'Thirty focused minutes can make a strong difference—give it your best.' },
    { challenge: 'Stretch for fifteen minutes', encouragement: 'Slow down, breathe deeply, and give your body space to move well.' },
    { challenge: 'Skip late-night snacks after dinner', encouragement: 'Honor your evening routine and wake up proud of your mindful choice.' },
    { challenge: 'Walk or bike every trip under one mile', encouragement: 'Turn everyday errands into energizing wins for your body.' },
    { challenge: 'Log every meal before you eat it', encouragement: 'A moment of awareness before each meal keeps your goals in view.' },
    { challenge: 'Do 20 burpees before noon', encouragement: 'Start strong and finish proud—your early effort sets the tone for the day.' },
    { challenge: 'Replace one sugary drink with water', encouragement: 'One simple swap is a meaningful step toward feeling your best.' },
    { challenge: 'Complete a 15-minute HIIT circuit', encouragement: 'Bring focused energy for fifteen minutes, then enjoy the strength you earned.' },
    { challenge: 'Reach 8,000 steps before dinner', encouragement: 'Keep moving in small bursts—every step brings you closer.' },
    { challenge: 'Prep tomorrow’s meals tonight', encouragement: 'A little preparation tonight makes tomorrow’s healthy choices easier.' },
    { challenge: 'Do 100 jumping jacks across the day', encouragement: 'Spread the reps out and let each burst lift your energy.' },
    { challenge: 'Include a protein source with every meal', encouragement: 'Balanced meals help you stay fueled, satisfied, and ready for the day.' },
    { challenge: 'Take a brisk 45-minute walk outdoors', encouragement: 'Enjoy the fresh air and let every brisk minute build your endurance.' },
    { challenge: 'Do three sets of lunges on each leg', encouragement: 'Strong, steady lunges today support confident movement tomorrow.' },
    { challenge: 'Choose whole foods instead of processed snacks', encouragement: 'Choose food that fuels your goals and makes you feel cared for.' },
    { challenge: 'Spend ten minutes on mobility work', encouragement: 'Ten thoughtful minutes can help your body move with more freedom.' },
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
    return CHALLENGES[i].challenge;
  }

  function encouragementForDate(date) {
    var index = dayIndex(date || new Date());
    var i = ((index % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length;
    return CHALLENGES[i].encouragement;
  }

  function render(date) {
    var el = document.getElementById('daily-challenge-text');
    var encouragementEl = document.getElementById('daily-challenge-encouragement');
    if (!el) return;
    el.textContent = challengeForDate(date);
    if (encouragementEl) encouragementEl.textContent = encouragementForDate(date);
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
    dayIndex: dayIndex,
    render: render,
  };
})(window);
