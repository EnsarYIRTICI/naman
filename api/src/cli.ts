#!/usr/bin/env node
// Yönetim komutları (sunucuda / container içinde):
//   node dist/cli.js user add <kullanici>       yeni kullanıcı (şifre ekranda görünmez)
//   node dist/cli.js user passwd <kullanici>    şifre değiştir (açık oturumlar kapanır)
//   node dist/cli.js user delete <kullanici>    kullanıcıyı sil
//   node dist/cli.js user list                  kullanıcıları listele
import { Auth, normalizeUsername, validatePassword, validateUsername } from "./auth";
import { createPool, migrate } from "./db";

function readHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      let buf = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (d) => (buf += d));
      process.stdin.on("end", () => resolve((buf.split("\n")[0] ?? "").replace(/\r$/, "")));
      return;
    }
    process.stdout.write(question);
    let s = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === "\r" || c === "\n" || c === "\u0004") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          return resolve(s);
        }
        if (c === "\u0003") {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (c === "\u007f" || c === "\b") s = s.slice(0, -1);
        else s += c;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function askNewPassword(): Promise<string> {
  const p1 = await readHidden("Yeni şifre (en az 10 karakter): ");
  const err = validatePassword(p1);
  if (err) fail(err);
  if (process.stdin.isTTY) {
    const p2 = await readHidden("Şifre (tekrar): ");
    if (p1 !== p2) fail("Şifreler eşleşmiyor.");
  }
  return p1;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function needUser(arg: string | undefined): string {
  const u = normalizeUsername(arg);
  if (!validateUsername(u)) fail("Geçersiz kullanıcı adı. 3-32 karakter; küçük harf, rakam, nokta, tire, alt çizgi.");
  return u;
}

const USAGE = `Kullanım:
  node dist/cli.js user add <kullanici>
  node dist/cli.js user passwd <kullanici>
  node dist/cli.js user delete <kullanici>
  node dist/cli.js user list`;

async function main() {
  const [cmd, sub, arg] = process.argv.slice(2);
  if (!cmd) {
    console.log(USAGE);
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL tanımlı değil.");
  const pool = createPool(url);
  await migrate(pool);
  const auth = new Auth(pool, { idleMs: 3600_000, absoluteMs: 86400_000 });

  try {
    if (cmd === "user" && sub === "add") {
      const u = needUser(arg);
      if (await auth.userExists(u)) fail("Bu kullanıcı zaten var. Şifre için: passwd");
      await auth.createUser(u, await askNewPassword());
      console.log("Kullanıcı oluşturuldu: " + u);
    } else if (cmd === "user" && sub === "passwd") {
      const u = needUser(arg);
      if (!(await auth.userExists(u))) fail("Kullanıcı bulunamadı.");
      await auth.setPassword(u, await askNewPassword());
      console.log("Şifre güncellendi, bu kullanıcının açık oturumları kapatıldı.");
    } else if (cmd === "user" && sub === "delete") {
      const u = needUser(arg);
      console.log((await auth.deleteUser(u)) ? "Kullanıcı silindi: " + u : "Kullanıcı bulunamadı.");
    } else if (cmd === "user" && sub === "list") {
      const rows = await auth.listUsers();
      if (!rows.length) console.log("(kullanıcı yok)");
      for (const r of rows) console.log(r.username + "\t" + r.created_at.toISOString());
    } else {
      fail(USAGE);
    }
  } finally {
    auth.dispose();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
