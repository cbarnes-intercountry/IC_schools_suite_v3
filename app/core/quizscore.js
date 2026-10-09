/* ============================================================================
   Classroom Exam App — core/quizscore.js
   Loaded as a plain script in the order set by index.html; every file shares one
   global scope, so nothing is imported or exported.
   ============================================================================ */

/* How a live quiz is scored. Pure arithmetic, in core, because the teacher's stage, the
   projected leaderboard and the student's own card all have to agree about it and a second
   implementation is how they would stop agreeing.

   ---------------------------------------------------------------------------
   THE FORMULA, and why it is not Kahoot's

       grace  = 0.25 x T                           reading time, no decay
       t'     = max(0, t - grace)
       points = round(700 + 300 x (1 - t' / (T - grace)))     CORRECT answers only
       wrong, or no answer                                     = 0
       no streak bonus

   Kahoot's floor is 500 out of 1000, which means a student answering everything at full speed
   scores the same as one who gets TWICE as many right. In a language class that rewards the
   confident guess over the considered answer, and it systematically favours whoever reads
   English fastest — which is the thing being taught, not a thing to be scored on.

   A floor of 700 caps the advantage of pure speed at +43% (1000n = 700m at m = 1.43n), so
   accuracy stays the dominant term without speed becoming decorative.

   THE GRACE WINDOW is the part that actually protects the weaker reader. The first quarter of
   the clock scores full marks whatever happens in it: four seconds of a twenty-second question
   is reading, and penalising reading time penalises CEFR level rather than knowledge.

   NO STREAK BONUS. Kahoot adds up to +500 for consecutive correct answers. It compounds, so it
   widens the gap between the strongest and weakest student faster than the speed term ever
   does, and the student who breaks a streak loses a bonus whose size they could not see.

   A WRONG ANSWER SCORES ZERO, fast or slow. With a 700 floor that means a thoughtful correct
   answer on the buzzer is worth more than two fast wrong ones, which is the incentive a
   language class wants.
   --------------------------------------------------------------------------- */

const QZ_FLOOR = 700;          // a correct answer is never worth less than this
const QZ_SPEED = 300;          // the most that answering instantly can add
const QZ_GRACE = 0.25;         // the fraction of the clock that does not decay

/* Points for one answer. `ms` is how long the student took from the question appearing;
   `limitMs` is that question's clock. Correct only — the caller decides correctness, because
   marking a short answer is strict and belongs to core/answers.js. */
function qzPoints(correct, ms, limitMs){
  if(!correct) return 0;
  const T = Number(limitMs) || 0;
  /* A question with no clock cannot have a speed term — there is nothing to be fast against —
     so it is worth the floor. Scoring it 1000 would make an untimed question the most valuable
     one on the board, which is the opposite of what an author means by leaving the limit off. */
  if(T <= 0) return QZ_FLOOR;
  const grace = T * QZ_GRACE;
  /* Not named `t`: that is the text lookup, and a local of the same name shadowing it is the
     defect that emptied Teacher Accounts in v3.3. The suite fails if one comes back. */
  const took = Math.max(0, Math.min(Number(ms) || 0, T));
  if(took <= grace) return QZ_FLOOR + QZ_SPEED;
  const span = T - grace;
  return Math.round(QZ_FLOOR + QZ_SPEED * (1 - (took - grace) / span));
}

/* ---------------------------------------------------------------------------
   TEAMS, and why the mean rather than the total

   Teams are formed automatically and rarely divide evenly: 23 students make three teams of six
   and one of five. Summing would hand the bigger team a permanent lead for being bigger, which
   has nothing to do with English.

   So a team's score for a question is the MEAN over its members — and the denominator is who
   was in the team when that question was asked, not who answered it. A member who said nothing
   counts as a zero. Otherwise a team improves by having people sit out, which is the wrong
   thing to teach a room.

   Per question rather than once at the end, because that is what makes a latecomer and a
   removed student ordinary rather than special cases: each question is averaged over whoever
   was there for it.
   --------------------------------------------------------------------------- */

/* One question's team scores. `points` maps studentId -> points for this question (0 for a
   member who answered nothing). `teamOf` maps studentId -> team name. Returns team -> mean. */
function qzTeamQuestion(points, teamOf, roster){
  const sum = {}, n = {};
  (roster || Object.keys(teamOf || {})).forEach(id => {
    const team = (teamOf || {})[id];
    if(!team) return;                    // not on a team: counted individually, not here
    sum[team] = (sum[team] || 0) + (Number((points || {})[id]) || 0);
    n[team] = (n[team] || 0) + 1;
  });
  const out = {};
  Object.keys(sum).forEach(team => { out[team] = n[team] ? sum[team] / n[team] : 0; });
  return out;
}

/* ---------------------------------------------------------------------------
   THE STANDINGS

   Ties break on TOTAL RESPONSE TIME, fastest first — and a question nobody answered counts as
   the whole clock. Without that, not answering would LOWER a student's total time and improve
   their tiebreak, which is an incentive to sit out the questions you do not know.
   --------------------------------------------------------------------------- */

/* rows: [{ key, name, score, timeMs }] -> sorted, with `place` filled in. Equal score AND equal
   time share a place, as they do in any sport. */
function qzRank(rows){
  const sorted = (rows || []).slice().sort((a, b) =>
    (b.score - a.score) || (a.timeMs - b.timeMs) || String(a.name || "").localeCompare(String(b.name || "")));
  let place = 0, lastScore = null, lastTime = null;
  sorted.forEach((r, i) => {
    if(r.score !== lastScore || r.timeMs !== lastTime){ place = i + 1; lastScore = r.score; lastTime = r.timeMs; }
    r.place = place;
  });
  return sorted;
}

/* Everything on one screen, from the participants and the questions.

   `answers` is what each student sent: studentId -> { pos: { v, ms } }. Correctness is decided
   by `mark`, which the caller supplies so that this file never has an opinion about whether
   "Risk" matches "risk" — that ruling lives in core/answers.js and must have exactly one home.

   An unscored item — a poll or a word cloud dropped into the sequence for discussion — is worth
   nothing to anybody and is skipped here rather than being counted as a question everyone got
   wrong. */
function qzStandings(questions, participants, opts){
  const o = opts || {};
  const teamOf = o.teamOf || null;
  const mark = o.mark || (() => false);
  const limitOf = o.limitOf || (q => (q.timeLimitSec || 0) * 1000);

  const roster = participants.map(p => p.studentId);
  const score = {}, time = {};
  roster.forEach(id => { score[id] = 0; time[id] = 0; });

  (questions || []).forEach((q, pos) => {
    if(!qzScored(q)) return;
    const limit = limitOf(q, pos);
    const pts = {};
    participants.forEach(p => {
      const a = ((p.progress && p.progress.qz) || {})[String(pos)];
      const given = a ? a.v : undefined;
      const ms = a ? Number(a.ms) || 0 : limit;      // no answer costs the whole clock
      const right = a !== undefined && a !== null && mark(q, given);
      pts[p.studentId] = qzPoints(right, ms, limit);
      score[p.studentId] += pts[p.studentId];
      time[p.studentId] += Math.min(ms, limit || ms);
    });
    if(teamOf){
      const means = qzTeamQuestion(pts, teamOf, roster);
      Object.keys(means).forEach(team => { score["@" + team] = (score["@" + team] || 0) + means[team]; });
    }
  });

  if(teamOf){
    /* A team's time is its members' total, so a tie between two teams breaks on the same
       measure as a tie between two students. */
    const tt = {};
    roster.forEach(id => { const team = teamOf[id]; if(team) tt[team] = (tt[team] || 0) + time[id]; });
    return qzRank(Object.keys(tt).map(team => ({
      key: team, name: team, team: true,
      score: Math.round(score["@" + team] || 0), timeMs: tt[team]
    })));
  }

  const byId = {};
  participants.forEach(p => { byId[p.studentId] = p; });
  return qzRank(roster.map(id => ({
    key: id, name: (byId[id].firstName || byId[id].surname || "?"),
    score: score[id], timeMs: time[id]
  })));
}

/* Does this item put points on the board? A poll and a word cloud have no right answer to
   reward, so they are discussion beats in the middle of a quiz rather than questions. A poll
   that was given a correct answer in v3.20 is still not scored here: it is a check the room
   answers together, and a quiz that silently marked one would turn a discussion into an exam. */
function qzScored(q){
  return !!q && !isPollType(q.type);
}
