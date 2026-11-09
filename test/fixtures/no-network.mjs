// Preloaded into the demo server in tests: any attempt to load supabase-js or
// make a network call crashes the process, so a passing run proves demo mode
// never touches either.
import { registerHooks } from 'node:module';
import net from 'node:net';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@supabase/') || specifier.endsWith('/client.ts') || specifier.endsWith('/store-supabase.ts')) {
      throw new Error(`demo mode loaded ${specifier}`);
    }
    return next(specifier, context);
  },
});
globalThis.fetch = () => {
  throw new Error('demo mode called fetch');
};
net.connect = net.createConnection = () => {
  throw new Error('demo mode opened a socket');
};
