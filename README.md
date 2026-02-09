# Me News — The 1st AI-Powered Social Media

## Inspiration

Social media is incredible, but it has a scale problem. When it gets big, a few winners capture all the attention, and everyone else gets the downsides: an endless feed, performative posting, and a weird feeling that you're consuming "content" more than you're connecting with people.

I wanted to go back to something simpler: **what if social media felt like a group chat again** — but *more fun* and *more watchable*.

That's the idea behind **Me News**: your friends and family post little moments, and you get them back as a daily "news episode" with an AI host.

---

## What it does

Me News is truly social media: **small updates from people you actually know**, packaged into a short, engaging video report.

* Friend groups post short clips (life updates, funny moments, small wins, anything)
* The app collates them into a daily "news report" for the group
* The AI writes the script and captions, and selects simple graphics (emojis for now)
* Instead of waiting for comments, the AI **interviews the group** about what happened — so the "conversation" becomes part of the episode
* People can reply by **text** (chat-style) or by sending **video responses**

The result is a format that's easy to watch, easy to share, and doesn't require doomscrolling.

---

## How we built it

I used **anti-gravity** for orchestration, **Gemini** for the writing + interviewing + packaging logic, and **Claude** as a code reviewer. That combo worked surprisingly well: fast iteration, strong feedback loops, and fewer blind spots.

I chose **Rails** as the core stack because it's a great "default" for building real products quickly — and it plays nicely with AI tooling. Rails kept everything cohesive, and we didn't get bogged down in framework mismatches or glue-code fatigue.

---

## Challenges we ran into

**Compiling the video was the monster.**
Getting the episode to render reliably — with consistent timing, subtitles, music, and transitions — was a massive headache and stayed painful almost up to the deadline.

I spent so much time making the video pipeline solid that I had to pare back a few features. But I think that trade was worth it: the core experience is the report, and that part now feels right.

---

## Accomplishments that we're proud of

The videos are genuinely engaging — they actually make people smile. That was the whole point.

The most encouraging signal: **friends and family kept using it after the demo stage**, which is the hardest test for a social product. It means the format isn't just a novelty — it's something people want in their routine.

---

## What we learned

* **The format matters more than the feed.** A daily "episode" creates anticipation and closure.
* **AI works best as a host/producer, not the star.** The content is still the people — the AI just makes it watchable.
* **Friction kills social apps.** The easier it is to post and reply, the healthier the group stays.
* **Video rendering is product-critical.** If it's unreliable, everything else becomes irrelevant.

---

## What's next for Me News — The 1st AI-Powered Social Media

* **Refine onboarding + group setup** so it's effortless to create a "circle" and get the first episode
* **Make the interviewing smarter and more playful** (better questions, better follow-ups, better callbacks)
* **Upgrade the visuals** from emojis to richer graphics and eventually generative art
* **Stabilize and simplify the video pipeline** so it's boringly reliable
* Explore lightweight ways to encourage posting without turning it into "content creation" pressure
