# Playing on the office network (LAN)

One laptop is the **host**: it runs the game server. Everyone else just opens a web page.
No installs on the other laptops — any recent Chrome or Edge works.

## 0. Set up the host PC (once)

1. Install **Node.js** (the LTS version, 22.12 or newer) from https://nodejs.org and **Git** from
   https://git-scm.com. Defaults are fine.
2. Get the game: `git clone <the repo URL> escape-from-work` (or copy the folder from a USB stick).
3. Add the firewall rule (section 2). Optional: coworker photos in `assets/faces/` (then run
   `npm run faces`) and company images in `assets/menu/` (they stay on this PC).

The first start installs the game's packages, which needs internet **once**. After that the game
runs fully offline.

## 1. Host the game (every day)

1. On the host PC, start the server:
   - **Windows:** double-click **`start-server.bat`** in the game folder.
   - **macOS / Linux:** in a terminal in the game folder: `./start-server.sh`
   - (Same thing by hand: `npm start`.)
   It installs packages if they are missing or changed, builds the page, then starts the server.
2. Wait for the box it prints (a few seconds):
   ```
   Escape from Work server (production) on port 2567
     This PC:  http://localhost:2567
     LAN:      http://192.168.119.113:2567
   ```
3. Everyone opens the **LAN** address in Chrome or Edge. On the host you can use "This PC".
4. Stop the game with **Ctrl+C** in that window (then close it). Leaving it running is fine too.

The address changes from day to day (the office router hands out addresses), so always read it
from the printed box. If several LAN lines appear, use the one on the office Wi-Fi network
(ignore VPN ones such as Tailscale, usually `100.x` or `169.254.x`). Tip: pin a sticky note
"the game is at http://…:2567" on the host screen each morning.

Keep the host PC plugged in and set it to never sleep while plugged in (Windows: Settings →
System → Power → "When plugged in, put my device to sleep after: Never").

**While developing** use `npm run dev` instead: open Vite's **Network** address (port **5173**),
not port 2567. It also needs the firewall rule below, which already covers both ports.

## 2. The Windows firewall (once per host laptop)

The office Wi-Fi shows up in Windows as a **Public** network, and Windows blocks incoming
connections on Public networks. Node.js is usually only allowed on Private networks, so other
laptops get "This site can't be reached" (DECISIONS D030).

### Fix with one command (recommended)

Open **PowerShell as administrator** (Start → type "PowerShell" → right-click → *Run as
administrator*) and paste:

```powershell
New-NetFirewallRule -DisplayName "Escape from Work (game ports)" -Direction Inbound -Protocol TCP -LocalPort 2567,5173 -RemoteAddress LocalSubnet -Action Allow -Profile Any
```

This opens **only** the game ports (2567 and 5173), and **only** to machines on the same local
network. It does not turn on file sharing or network discovery, which switching the Wi-Fi to
"Private" would.

- Check it exists: `Get-NetFirewallRule -DisplayName "Escape from Work (game ports)"`
- Remove it later: `Remove-NetFirewallRule -DisplayName "Escape from Work (game ports)"`

### Or with the Windows settings app

1. Start → **Windows Defender Firewall with Advanced Security**.
2. **Inbound Rules** → **New Rule…** → **Port** → **TCP**, specific ports `2567, 5173` → Next.
3. **Allow the connection** → tick **Domain, Private and Public** → Next.
4. Name it `Escape from Work (game ports)` → Finish.
5. Open the new rule → **Scope** tab → *Remote IP address* → **These IP addresses** → Add →
   **Predefined set: Local subnet** → OK.

If you changed `net.port` in `config/tuning.json`, use that port instead of 2567.

## 3. Test from a second laptop

1. Both laptops on the **same** Wi-Fi (not one on the guest network).
2. On the second laptop open the printed LAN address. You should see the join screen.
3. Still stuck? On the second laptop, in PowerShell (use the host's address):
   ```powershell
   Test-NetConnection 192.168.119.113 -Port 2567
   ```
   `TcpTestSucceeded : True` = the network path is fine (look at the browser/address).
   `False` = the firewall or the network is blocking it (see below).
4. Press **F3** in the game: `ping` should be a few ms and "input … to screen" under ~100 ms.

## 4. Updating the game (git)

1. Stop the server (Ctrl+C in its window).
2. In the game folder: `git pull` (GitHub Desktop: **Fetch** then **Pull** does the same).
3. Start it again with the start script: it reinstalls packages by itself when the update
   changed them, and rebuilds the page.
4. Players reload the page (Ctrl+F5).

Your own data is safe across updates: `data/` (the league), `assets/faces/` and `assets/menu/`
are not in git. If `git pull` complains about local changes (for example you saved tuning with
F2 in dev mode), run `git stash`, `git pull`, then `git stash pop`, or ask whoever maintains the
game.

## 5. League data and backups

- The league (every race result, points, cups, records, awards) is one file on the host PC:
  **`data/league.json`**. It is not in git and never leaves this PC.
- **Automatic backups:** every time the server starts with the start script (or `npm start`) it
  copies the league to `data/backups/league-<date>.json`, once per day, and keeps the newest
  30 days (`league.backupKeep` in `config/tuning.json`).
- **Extra safety:** now and then copy the whole `data/` folder to a USB stick or a shared drive.
- **Restore a backup:** stop the server, copy `data/backups/league-<date>.json` over
  `data/league.json`, start the server again.
- **Move the game to another host PC:** copy `data/` (and `assets/faces/`, `assets/menu/`) into
  the game folder on the new PC.
- **Start a fresh season:** stop the server, move `data/league.json` somewhere safe (keep it for
  the hall of fame), start the server: the league starts empty.
- If the file is ever damaged, the server moves it aside as `data/league.corrupt-<time>.json`
  and starts an empty league; restore the newest backup as above.

## 6. Common problems

| What you see | Likely cause | Fix |
|---|---|---|
| Other laptops: "This site can't be reached" | Firewall on the host (Public network) | Add the rule in section 2 |
| Works on the host, not elsewhere, rule exists | The laptops are on different networks, or the Wi-Fi isolates clients (common on guest Wi-Fi) | Same Wi-Fi for everyone; if the office Wi-Fi isolates devices, use a phone hotspot or a small router |
| It worked yesterday, not today | The host's address changed | Read the new LAN line from the start window |
| Double-clicking `start-server.bat` flashes and closes / "Node.js is not installed" | Node is missing, or was installed while the window was open | Install Node.js LTS, then log out and in (or reboot) and try again |
| "Installing failed" on start | No internet during the one-time install | Connect once (phone hotspot is fine), start again; after that no internet is needed |
| "Node.js … is too old" | An old Node | Install the current LTS from nodejs.org |
| League screen says the league is off / "corrupt" in the log | `data/league.json` is damaged or locked | See section 5: restore yesterday's backup |
| Page loads, then "Can't reach the game server" (dev) | Port 2567 blocked but 5173 open | Make sure the rule has **both** ports |
| `Port 2567 is busy` on start | The game (or something else) is already running | Close the other terminal, or change `net.port` in `config/tuning.json` (and the firewall rule) |
| Laggy, rubber-banding | Weak Wi-Fi, host laptop on battery saver | Plug the host in, sit closer to the access point, check F3 `ping`; tuning: `net.interpDelayMs` |
| A player's car keeps driving after they vanished | Their laptop slept or lost Wi-Fi | Their seat is held for `net.reconnectSeconds` (30 s); reloading the page takes it back |
| Host laptop goes to sleep mid-race | Power settings | Plug in and set "When plugged in, put my device to sleep: Never" |
| Everyone sees an old version after an update | The browser kept the old page | Reload with **Ctrl+F5** |

## 7. What is running where

- `start-server.bat` / `start-server.sh` = install if needed, then `npm start`.
- `npm start` = one Node process: serves the page **and** the multiplayer server on port 2567.
- `npm run dev` = the game server on 2567 **plus** the Vite dev page on 5173 (hot reload, F2
  tuning panel). Dev tools never exist in `npm start`.
- No internet needed: everything (fonts, libraries) is served from the host laptop.
