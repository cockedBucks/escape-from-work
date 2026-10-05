# Playing on the office network (LAN)

One laptop is the **host**: it runs the game server. Everyone else just opens a web page.
No installs on the other laptops — any recent Chrome or Edge works.

## 1. Host the game (every time)

1. On the host laptop, in the project folder:
   ```
   npm start
   ```
2. Wait for the box it prints (a few seconds; it builds the page first):
   ```
   Escape from Work server (production) on port 2567
     This PC:  http://localhost:2567
     LAN:      http://192.168.119.113:2567
   ```
3. Everyone opens the **LAN** address in their browser. You can use the "This PC" one.
4. Stop the game with **Ctrl+C** in that terminal.

The address changes from day to day (the office router hands out addresses), so always read it
from the printed box. If several LAN lines appear, use the one on the office Wi-Fi network
(ignore VPN ones such as Tailscale, usually `100.x` or `169.254.x`).

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

## 4. Common problems

| What you see | Likely cause | Fix |
|---|---|---|
| Other laptops: "This site can't be reached" | Firewall on the host (Public network) | Add the rule in section 2 |
| Works on the host, not elsewhere, rule exists | The laptops are on different networks, or the Wi-Fi isolates clients (common on guest Wi-Fi) | Same Wi-Fi for everyone; if the office Wi-Fi isolates devices, use a phone hotspot or a small router |
| It worked yesterday, not today | The host's address changed | Read the new LAN line from `npm start` |
| Page loads, then "Can't reach the game server" (dev) | Port 2567 blocked but 5173 open | Make sure the rule has **both** ports |
| `Port 2567 is busy` on start | The game (or something else) is already running | Close the other terminal, or change `net.port` in `config/tuning.json` (and the firewall rule) |
| Laggy, rubber-banding | Weak Wi-Fi, host laptop on battery saver | Plug the host in, sit closer to the access point, check F3 `ping`; tuning: `net.interpDelayMs` |
| A player's car keeps driving after they vanished | Their laptop slept or lost Wi-Fi | Their seat is held for `net.reconnectSeconds` (30 s); reloading the page takes it back |
| Host laptop goes to sleep mid-race | Power settings | Plug in and set "When plugged in, put my device to sleep: Never" for the session |

## 5. What is running where

- `npm start` = one Node process: serves the page **and** the multiplayer server on port 2567.
- `npm run dev` = the game server on 2567 **plus** the Vite dev page on 5173 (hot reload, F2
  tuning panel). Dev tools never exist in `npm start`.
- No internet needed: everything (fonts, libraries) is served from the host laptop.
