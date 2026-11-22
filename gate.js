// the gate: takes the key from the link, hands it to the worker, opens the game. The key is not in this site.
(async () => {
  const word = t => { document.getElementById('word').textContent = t; };
  const hash = location.hash, isLink = hash.startsWith('#k'), found = /^#k=([A-Za-z0-9_-]{43})$/.exec(hash);
  addEventListener('hashchange', () => { if (location.hash.startsWith('#k')) location.reload(); });
  if (hash) history.replaceState(null, '', location.pathname);
  if (isLink && !found) return word('This link is cut short or mistyped. Copy the whole link.');
  if (!('serviceWorker' in navigator) || typeof DecompressionStream === 'undefined' || !window.crypto || !crypto.subtle)
    return word('This browser cannot open the game. Use an up-to-date browser in a normal window (not a private one).');
  let back = false;
  try { back = sessionStorage.getItem('forge-eon.back') === '1'; sessionStorage.removeItem('forge-eon.back'); } catch (e) { /* no storage */ }
  try {
    await navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' });
    const reg = await navigator.serviceWorker.ready;
    const said = await new Promise(done => {
      const ch = new MessageChannel(), late = setTimeout(() => done('late'), 30000);
      ch.port1.onmessage = e => { clearTimeout(late); done(e.data); };
      reg.active.postMessage({ key: found ? found[1] : null }, [ch.port2]);
    });
    if (said === 'none') return word('This game is private. It opens with its link.');
    if (said === 'wrong') return word('This link does not open this game.');
    if (said !== 'ok') return word('Could not reach the game. Check the internet and reload.');
    if (back) { word('Ready.'); document.getElementById('open').hidden = false; return; }   // came back from a reload that went round the worker: no loop
    location.replace('play.html');
  } catch (e) {
    word('This browser blocked the game. Use a normal window (not a private one) and reload.');
  }
})();
