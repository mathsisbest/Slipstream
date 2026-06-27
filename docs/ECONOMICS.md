# Economics

Honest numbers, so you don't get surprised.

## Subscription, not metered API

Driving the installed `claude` or `codex` CLI (including headless, `claude -p`) uses your **subscription**. You log in once; the CLI uses those credentials. A workflow that shells out to the CLI costs no extra dollars.

The metered path, where you pay per token, is calling the raw Anthropic or OpenAI API directly. The kit never does this, and you shouldn't add it without meaning to.

## The one trap

If `ANTHROPIC_API_KEY` is set in your environment, Claude Code uses **that key** and bills you per token, silently, instead of your subscription. `bin/doctor.sh` checks for it. If you don't intend to use metered API, unset it.

## Subscription is not unlimited

It's rate-limited, not free. You draw from a shared rolling pool across everything you run. Parallel and overnight work drains it faster, and when you hit the limit you get throttled, not billed. Plan for throughput, not cost.

## Concurrency is capped

The harness runs roughly sixteen agents at once at most, often fewer depending on your machine. "A hundred agents" is a queue, not a moment. Real wall-clock speed comes from good decomposition and a fast gate, not from a bigger number.

## A standing risk to know about

Anthropic announced, then paused, a change that would move programmatic use (the SDK, `claude -p`, third-party apps) off the subscription and onto a separate metered credit pool. It is not in effect, and they've said they'll give notice before any future change. If you build anything that leans hard on subscription-driven automation, keep an eye on this.

## Spend where it pays

- Haiku for read/search fan-out.
- Sonnet for building.
- Opus for genuine reasoning only.

Running every agent at max effort burns the pool for no quality gain on routine work. Tier deliberately.
