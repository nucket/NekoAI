# The Story of Neko

> _A cat chasing a cursor. 38 years of history. One idea that refused to die._

---

## Origins

Everything started in **1988** in Japan, on an NEC PC-9801 running MS-DOS.

**Naoshi Watanabe** (若田部 直) wrote a tiny program called `NEKO.COM` — a small cat that ran across the command-line screen chasing the mouse pointer. It did nothing useful. It was delightful. The idea spread instantly through Japan's early PC community.

One year later, in **1989**, **Kenji Gotoh** (後藤寿庵 / Juan Gotoh) ported the concept to the Macintosh as a _Desktop Accessory_ — a lightweight utility that lived in the menu bar era of classic Mac OS. Gotoh designed the iconic **32×32 pixel sprites** that would define Neko's look for the next three decades: the round white cat with simple black eyes, running, scratching, sleeping, washing its face.

Gotoh released the sprites to the public domain. That single decision is what made Neko immortal.

---

## Spreading Across Systems

### 1990 — X Window System (Unix)

**Masayuki Koba** (古場正行) ported Neko to the X Window System as `xneko`, released under the GNU Public License. The X11 environment's open architecture made `xneko` trivially easy to compile and run on any Unix machine — it became a standard fixture on university servers and research workstations worldwide.

Shortly after, **Tatsuya Kato** (加藤達也) created `oneko` — a refinement of `xneko` for Linux and BSD, released to the public domain. `oneko` added the ability to chase open windows in addition to the cursor and introduced alternate animal sprites (a dog among others). It's still actively maintained and installable today via most Linux package managers.

```bash
sudo apt install oneko   # still works in 2026
```

### 1991 — Windows and OS/2

Three independent ports hit Windows 3.x in 1991:

- **Neko Runs Free** by **Dara Khani**
- **WNEKO** by **Michael Bankstahl**
- **Cat and Mouse** (`NEKO.EXE`) by **IBM** for OS/2 2.x

IBM's inclusion is historically notable: after Kenji Gotoh publicly released the Mac sprites, IBM approached him to license the artwork for OS/2. Gotoh sold non-exclusive rights for approximately ¥300,000. `NEKO.EXE` was bundled with OS/2 2.x — a corporate operating system shipping a tiny cat as a built-in toy.

### 1993 — Amiga

`Ameko` appeared on the Commodore Amiga platform, carrying the idea into yet another computing community.

---

## The Windows 95/98 Era

By the mid-1990s, Windows had won the desktop. **David Harvey** ported `xneko` to Win32 as **Neko95** (later **Neko98**), adapting it for the modern Windows API while preserving the classic sprite aesthetic.

Harvey distributed Neko95/98 as freeware from his GeoCities page (later moved to BT Internet after GeoCities repeatedly blocked direct `.exe` downloads). The project received iterative updates from 1997 through 2000.

**Notable milestones in the Neko95/Neko98 lineage:**

| Date          | Update                                                         |
| ------------- | -------------------------------------------------------------- |
| October 1998  | Initial Neko95 release — classic cursor chasing on Win95/98/NT |
| November 1998 | First update — configuration panel, alternate sprites          |
| April 1999    | Stability fix — crash on "Apply" button resolved               |
| January 2000  | **Footprints** — the cat now leaves paw prints as it walks     |
| August 2000   | Auto-installer added; site migrated off GeoCities              |

The footprints update — tiny paw-print stamps trailing across the desktop — became a fan favorite. Harvey's final note before the project went quiet: _"I've had it with Geocities. Good bye."_ The code was archived to SourceForge and GitHub, where it remains accessible.

**Alternate sprites** available in Neko98: a dog, Metroid, Pac-Man, and a TIE Fighter among others. The moddable sprite system anticipated the community customization culture that would define later desktop pets.

---

## The Idle Years and Revival

After 2000, Neko lay dormant as a concept. Web apps replaced desktop utilities, and always-on-top pixel pets felt anachronistic. But `oneko` kept running on Linux. Emulation communities kept `NEKO.EXE` alive. Retro computing enthusiasts kept writing _"remember Neko?"_ blog posts.

The revival came in multiple waves:

- **Shimeji** (2008, Japan) — a full desktop mascot framework with physics and interactions, proving the concept still had audience
- **eSheep** (Adrian Tiger, ~2012) — a faithful Windows XP sheep simulator with source on GitHub
- **WebNeko** (Eliot Akira, ~2014) — a JavaScript browser port that ran in any tab
- **Neko (React)** (Eliot Akira) — a modern React component version
- Countless Arduino, Tamagotchi, and smartwatch ports appeared throughout the 2010s

Each wave attracted a new generation who had never seen the original, and a nostalgic older generation who had.

---

## Technical Lineage

```
1988 NEKO.COM          Naoshi Watanabe       NEC PC-9801 / MS-DOS
  └─ 1989 NekoDA       Kenji Gotoh           Macintosh (Desktop Accessory)
       └─ 1990 xneko   Masayuki Koba         X Window System (GPL)
            └─ 1990 oneko  Tatsuya Kato      Linux / BSD (Public Domain)
                 └─ 1997 Neko95/98  David Harvey  Windows 95/98/NT
                      └─ 2000s WebNeko, Shimeji, eSheep...
                           └─ 2026 NekoAI   Naudy Castellanos  Tauri v2 / AI
```

---

## The People Behind Neko

| Name                            | Contribution                                                               | Platform                | Year      |
| ------------------------------- | -------------------------------------------------------------------------- | ----------------------- | --------- |
| **Naoshi Watanabe** (若田部 直) | Created the original concept                                               | NEC PC-9801 / MS-DOS    | ~1988     |
| **Kenji Gotoh** (後藤寿庵)      | Mac port; designed the iconic 32×32 sprites; released art to public domain | Macintosh               | 1989      |
| **Masayuki Koba** (古場正行)    | X Window System port (`xneko`)                                             | X11 / Unix              | 1990      |
| **Tatsuya Kato** (加藤達也)     | Linux/BSD port (`oneko`); multi-window chasing                             | Linux / BSD             | 1990      |
| **IBM OS/2 Team**               | Bundled as `NEKO.EXE` in OS/2 2.x                                          | OS/2                    | 1991      |
| **Dara Khani**                  | _Neko Runs Free_                                                           | Windows 3.x             | 1991      |
| **Michael Bankstahl**           | WNEKO                                                                      | Windows 3.x             | 1991      |
| **David Harvey**                | Neko95 / Neko98 — Win32 port, footprints, installers                       | Windows 95–NT           | 1997–2000 |
| **Eliot Akira**                 | WebNeko and React Neko — browser revival                                   | Web / React             | 2014+     |
| **Naudy Castellanos**           | **NekoAI** — Tauri v2, AI integration, modern revival                      | Windows / Linux / macOS | 2026      |

Additional contributors to `oneko` / `xneko`: John Lerchey, Eric Anderson, Toshihiro Kanda, Kiichiroh Mukose.

---

## What Made Neko Last

Neko's longevity comes down to a few decisions made in 1989:

1. **Kenji Gotoh released the sprites to the public domain.** No licensing friction, no cease-and-desist letters. Anyone could port, modify, and redistribute.

2. **The concept fits on a napkin.** "Small animal chases cursor." Every platform has a cursor. Every system has pixels. The idea is inherently portable.

3. **It does nothing useful and everything right.** Neko doesn't optimize your system, block ads, or manage your calendar. It just exists, and somehow that's enough.

4. **Nostalgia compounds over time.** Every generation of developers discovered Neko, grew up, and eventually wanted to bring it back — for themselves, and to show the next generation.

---

## NekoAI and This Chapter

**NekoAI** is one more link in this chain.

The original Neko was a reaction to the arrival of the graphical cursor — _if there's something to follow, let's follow it_. NekoAI is a reaction to the arrival of large language models: _if there's something to think with, let's build a pet that thinks_.

The 32×32 pixel sprite is still here. The cursor-chasing is still here. The idle animations — wash, scratch, yawn, sleep — follow the same sequence Kenji Gotoh animated in 1989 and Tatsuya Kato coded in 1990. The new part is the brain.

It's a love letter written in Rust and TypeScript to a program written in Assembly on a Japanese PC in 1988.

---

## Sources & Further Reading

- **Eliot Akira** — ["Neko: History of a Software Pet"](https://eliotakira.com/neko/) (2022) — the most complete English-language history of Neko
- **Wikipedia** — [Neko (software)](<https://en.wikipedia.org/wiki/Neko_(software)>)
- **FilesFound** — [Neko95 History & Downloads](https://filesfound.net/articles/neko95)
- **GitHub — Eliot Akira** — [github.com/eliot-akira/neko](https://github.com/eliot-akira/neko)
- **GitHub — Neko98 archive** — [github.com/neozeed/neko98](https://github.com/neozeed/neko98)
- **Internet Archive** — [GeoCities David Harvey page (2003 snapshot)](https://web.archive.org/web/20031204172802/http://www.geocities.com/SiliconValley/Haven/4173/)
- Masayuki Koba — `xneko` source code (1990)
- Tatsuya Kato — `oneko` README

---

_Compiled 2026. The cat keeps running._
