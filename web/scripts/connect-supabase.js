#!/usr/bin/env node
// Connects the web CRM's cloud sync to Supabase project insure-club-18.
// Asks for the advisor email and password (password input is hidden), checks the
// sign-in, then writes them to web/.env. Nothing secret is printed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://pzezoumopzwczakpsdlk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M6hWtVUT1bwaAkV2Ma6VKw_OzToQzvz';
const envPath = path.join(__dirname, '..', '.env');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const { stdin } = process;
    process.stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            if (!hidden) process.stdout.write('\b \b');
          }
        } else if (ch >= ' ') {
          value += ch;
          if (!hidden) process.stdout.write(ch);
        }
      }
    };
    stdin.on('data', onData);
  });
}

function readEnv() {
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function envValue(v) {
  return /[\s#"'$]/.test(v) ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : v;
}

async function main() {
  console.log('InsureClub web CRM -> Supabase cloud sync setup');
  console.log('Use the advisor login you created in Supabase (Authentication -> Users).\n');

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const email = await ask('Advisor email: ');
    const password = await ask('Advisor password (hidden): ', { hidden: true });
    if (!email || !password) {
      console.log('Email and password are both required.\n');
      continue;
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      console.log(`Sign-in failed: ${error.message}\n`);
      continue;
    }
    await sb.auth.signOut().catch(() => {});

    const existing = readEnv();
    const lines = [
      `PORT=${existing.PORT || '3000'}`,
      `SESSION_SECRET=${existing.SESSION_SECRET || crypto.randomBytes(32).toString('hex')}`,
      '# Supabase cloud sync (project insure-club-18)',
      `SUPABASE_URL=${SUPABASE_URL}`,
      `SUPABASE_ANON_KEY=${SUPABASE_KEY}`,
      `SUPABASE_EMAIL=${envValue(email)}`,
      `SUPABASE_PASSWORD=${envValue(password)}`,
      '',
    ];
    fs.writeFileSync(envPath, lines.join('\n'), { mode: 0o600 });
    fs.chmodSync(envPath, 0o600);
    console.log(`\nSigned in as ${data.user?.email}. Saved sync settings to ${envPath}`);
    console.log('SETUP_OK');
    return;
  }
  console.log('SETUP_FAILED');
  process.exitCode = 1;
}

main();
