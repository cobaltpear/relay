# Cobalt Pear relay

The small Cloudflare Worker behind the **Make it** button in [Cobalt Pear](https://cobaltpear.github.io/).

RunPod does not let a web page create endpoints directly, so the page sends your key here once. This code then makes a template and an endpoint on **your** RunPod account and returns the endpoint ID.

- It accepts requests only from `https://cobaltpear.github.io`.
- It stores nothing and keeps no request logs (`observability` is off in `wrangler.toml`).
- Everything it does is in [`worker.js`](worker.js).

Prefer not to use it? Do the steps by hand — they are shown under the button.
