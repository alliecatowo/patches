/**
 * The direct messages each fake friend sends the visitor (ADR 0044). They are sealed in the
 * visitor's browser with the real client E2EE runtime, so what the node stores is ciphertext
 * addressed to the visitor's own device. Copy follows ADR 0036: bodies are hidden from the node,
 * metadata (who, when) is not.
 */
export const DEMO_DM_SCRIPT: Readonly<Record<string, readonly string[]>> = {
  maya: [
    'Hey, welcome! This conversation is end-to-end encrypted.',
    "The node can see that you and I are talking, and when. It can't read what we say. That's the whole trade.",
    "Reply if you like. I'm a demo friend, so I won't answer, but what you send is sealed on your device before it leaves.",
  ],
  jun: [
    'Did you see the keycaps post? Slightly purple, as promised.',
    'Also: if you ever install the terminal app, j and k move you around.',
  ],
  ines: ['Small node, big feelings. Say hi once you have had a look around.'],
};
