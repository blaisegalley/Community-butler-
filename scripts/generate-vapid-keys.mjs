#!/usr/bin/env node
/*
 * Generates the VAPID key pair that signs Web Push messages.
 *
 * Run it yourself:  node scripts/generate-vapid-keys.mjs
 *
 * The private key is a real secret. It never goes in this repository and
 * it should not be pasted into a chat window — put it straight into
 * Supabase → Edge Functions → Secrets. Keys are generated here, on your
 * machine, so nothing else ever sees them.
 *
 * Generating a new pair invalidates every existing subscription: browsers
 * tie a subscription to the public key it was created with, so everyone
 * would have to turn notifications on again. Do it once.
 */
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

// Web Push wants the raw uncompressed EC point, which is the trailing 65
// bytes of the DER/SPKI encoding, base64url encoded.
const spki = publicKey.export({ type: 'spki', format: 'der' });
const rawPublic = spki.subarray(spki.length - 65).toString('base64url');
const rawPrivate = privateKey.export({ format: 'jwk' }).d;

console.log(`
Add these two where they belong — and nowhere else.

  Supabase → Edge Functions → Secrets
    VAPID_PUBLIC_KEY   ${rawPublic}
    VAPID_PRIVATE_KEY  ${rawPrivate}

  GitHub → Settings → Secrets and variables → Actions → Variables
    VITE_VAPID_PUBLIC_KEY   ${rawPublic}

The public key is safe to publish; it ships inside the app. The private
key is what proves a push came from you — treat it like a password.
`);
