# VanillaDesk - Local-First Knowledge & Workspace Manager

<p align="center">
  <a href="https://youtu.be/O8-uhmgFaos" target="_blank">
    <img src="https://img.shields.io/badge/Demo_Video-red?style=for-the-badge&logo=youtube&logoColor=white" alt="Video YouTube" />
  </a>
  <a href="https://dragoneblu-dev.github.io/VanillaDesk/" target="_blank">
    <img src="https://img.shields.io/badge/Try_It_Now-success?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Prova l'App" />
  </a>
  <a href="https://github.com/dragoneblu-dev/VanillaDesk/archive/refs/heads/main.zip">
    <img src="https://img.shields.io/badge/Download_(ZIP)-blue?style=for-the-badge&logo=github&logoColor=white" alt="Scarica Repository" />
  </a>
</p>

Languages: [English](README.md) | [Italiano](README.it.md)


![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-1572B6?style=for-the-badge&logo=javascript&logoColor=white)
![HTML5](https://img.shields.io/badge/HTML5-1572B6?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)
![Local First](https://img.shields.io/badge/Architecture-Local_First-success?style=for-the-badge)
![AI Assisted](https://img.shields.io/badge/AI_Assisted_Development-8A2BE2?style=for-the-badge&logo=openai&logoColor=white)

![VanillaDesk Banner](vanillaDesk.png)

VanillaDesk is not just a simple notepad. It’s a hybrid workspace that combines an **advanced WYSIWYG word processor** with a powerful **in-memory Relational Database Engine (RDBMS)**.

Everything runs at lightning speed, entirely in your browser. No servers, no clouds, no subscriptions, no dependencies (Zero NPM, No React/Vue/Angular). Just pure, solid, and blazingly fast **Vanilla JavaScript**.

![Diario e Timeline](vanillaDesk2.png)
![Code & Kamban](vanillaDesk3.png)

## Why I Built VanillaDesk
Working as an IT professional in **AMS (Application Management Services)**, I constantly found myself managing repetitive tasks, log queries, code snippets, and fragmented documentation. I needed a tool as fast as a notepad but as powerful as a relational database, one that I could run on corporate machines without installing servers or relying on external Clouds blocked by strict firewalls. That’s how VanillaDesk was born.

## Key Features

* **100% Privacy & Local-First:** Your data never leaves your computer. The app saves everything into a local folder (Workspace) on your hard drive using the native *File System Access API*.
* **Native Relational Databases:** Turn raw data into Kanban Boards, Calendars, or Gantt Charts (Timelines) with a few clicks. Supports inter-table Relations, Rollups, and Formulas.
* **Automation Engine & Macros:** Create Triggers and Actions. Fire chain updates, trigger sound alerts, or modify hundreds of records in batch via custom programmable buttons.
* **Sandboxed JS Formulas:** A computation engine that allows you to write pure JavaScript code inside cells for complex math, string manipulation, and dynamic styling.
* **Transclusion (Live Citations):** Dynamically embed a text block or a table from another note. Edit the original, and all citations across your entire workspace update in real-time.
* **Military-Grade Encryption:** Protect your data with native WebCrypto API AES-GCM 256-bit encryption. Set a password, and the JSON saved on your disk becomes completely unreadable.
* **Crash Recovery System:** With every keystroke, the app performs a silent backup in IndexedDB. If your browser crashes or the tab is accidentally closed, your session is restored instantly.

## Architecture & Tech Stack
The engineering goal behind VanillaDesk is absolute longevity and zero technical debt from third-party frameworks.
* **Core:** HTML5, CSS3, ES6+ Vanilla JavaScript. Custom Virtual DOM and Caret Engine for Widgets.
* **Storage:** File System Access API (Disk Persistence) + IndexedDB (RAM Cache & Crash Recovery).
* **External Libraries:** The only external dependency is `Chart.js` (bundled locally in the repo) used to generate Analytic Dashboards and Pivot Charts.

## AI-Assisted Development (Pair-Programming)
To build this project, I adopted a modern AI-assisted development approach. The software architecture, business logic, in-memory database design, and overall UX are the result of my own vision and AMS background. LLM models acted as my "Co-Pilots" to accelerate boilerplate coding, optimize sorting/filtering algorithms, and refine the Vanilla CSS UI, always operating under strict, pre-defined architectural rules.

## How to Use (Zero Installation)
The application is a true serverless Single Page Application (SPA).
1. Clone or download the source code from this repository.
2. Double-click on `index.html` to open it in your browser.
3. Click on **"Create New Workspace"** to initialize your working folder on your PC.

⚠️ **Browser Compatibility:** Since VanillaDesk heavily relies on the modern *File System Access API* to physically write files to your hard drive, a Chromium-based browser is required (**Google Chrome, Microsoft Edge, Opera**). Browsers like Safari or Firefox do not yet fully support these APIs natively.

📧 **Email:** [dragoneblu@gmail.com](mailto:dragoneblu@gmail.com)

## License
This project is licensed under the **MIT License**. You are free to use, study, modify, and distribute it, even for commercial purposes. See the [LICENSE](LICENSE) file for details.
