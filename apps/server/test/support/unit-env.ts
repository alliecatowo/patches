/** Required, explicit auth-code delivery keyring for unit tests that instantiate AppModule. */
process.env.AUTH_CODE_DELIVERY_KEYS ??= JSON.stringify({
  test: Buffer.alloc(32, 7).toString('base64'),
});
process.env.AUTH_CODE_DELIVERY_ACTIVE_KEY_ID ??= 'test';
