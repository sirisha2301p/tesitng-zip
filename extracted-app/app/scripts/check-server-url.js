// Stops a web build that doesn't know where the game server is.
// On Vercel the app and the server live on different sites, so EXPO_PUBLIC_SERVER_URL is required.
const url = process.env.EXPO_PUBLIC_SERVER_URL;

if (!url) {
  console.error(
    '\nEXPO_PUBLIC_SERVER_URL is not set.\n' +
      'Set it to your game server address (e.g. https://draw-guess-server.onrender.com)\n' +
      'in Vercel: Project > Settings > Environment Variables, then redeploy.\n',
  );
  process.exit(1);
}
if (!/^https:\/\/[^/\s]+\/?$/.test(url)) {
  console.error(`\nEXPO_PUBLIC_SERVER_URL must look like https://your-server.onrender.com (got "${url}").\n`);
  process.exit(1);
}
console.log(`Game server: ${url}`);
