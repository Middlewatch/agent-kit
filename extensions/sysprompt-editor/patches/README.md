# Retired companion patch

`pi-0.85.0.patch` applies to upstream Pi `107d79f11072bbc8a3a757ed7fd69596bee7d68c`
(v0.85.0) and records the loader-side contract the extension required before
`docs/adr/0006-stay-on-stock-pi.md`: `contextFiles[].scope`,
`before_agent_start.originalSystemPrompt`, a post-transform `provider_request`
event, and immediate custom-entry persistence. The extension no longer needs it.
It is kept as the reference for an upstream proposal.
