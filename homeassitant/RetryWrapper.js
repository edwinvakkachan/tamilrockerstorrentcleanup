function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry(fn, payload, name, maxRetries = 3) {
  let attempt = 0;
  let delay = 3000;

  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log(`[${name}] Attempt ${attempt}`);

      await fn(payload);

      console.log(`✅ [${name}] Success`);
      return true;
    } catch (err) {
      console.error(`❌ [${name}] Failed`);

      if (attempt >= maxRetries) {
        console.error(`🚨 [${name}] Max retries reached`);
        return false;
      }

      await sleep(delay);
      delay *= 2;
    }
  }
}