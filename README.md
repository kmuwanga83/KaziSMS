# 🚀 SemaSMS - Enterprise SMS Gateway for East Africa

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-2.0.0-blue)](https://github.com/kmuwanga83/SemaSMS)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Tests](https://img.shields.io/badge/tests-13%2F13-success)](https://github.com/kmuwanga83/SemaSMS)

**"Speak SMS" - Lightning fast, Two-Way SMS API for East Africa**

SemaSMS (Swahili for "Speak SMS") is a production-ready, open-source SMS gateway that allows you to send and receive SMS messages, manage credits, and process payments via Mobile Money (MTN & Airtel). Built specifically for East Africa with direct carrier routing.

---

## 📋 Table of Contents

- [Features](#-features)
- [Supported Countries & Carriers](#-supported-countries--carriers)
- [Quick Start](#-quick-start)
- [API Documentation](#-api-documentation)
- [Usage Examples](#-usage-examples)
- [Webhooks](#-webhooks)
- [Pricing & Business Model](#-pricing--business-model)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Environment Variables](#-environment-variables)
- [Performance Metrics](#-performance-metrics)
- [Contributing](#-contributing)
- [License](#-license)
- [Support](#-support)

---

## ✨ Features

### 📱 Core SMS Capabilities
| Feature | Description |
|---------|-------------|
| **Send SMS** | High-volume SMS delivery with automatic carrier routing |
| **Two-Way SMS** | Receive and reply to messages in real-time |
| **Auto-Reply Rules** | Configure keyword-based automatic responses |
| **Bulk SMS Ready** | Architecture supports bulk messaging |
| **Delivery Reports** | Track message delivery status |

### 💰 Payment & Credits
| Feature | Description |
|---------|-------------|
| **Mobile Money** | MTN & Airtel payments via Flutterwave |
| **Credit System** | Pay-per-SMS model (50 UGX per message) |
| **Balance Management** | Real-time balance tracking |
| **Transaction History** | Complete audit trail of all purchases |

### 🔧 Technical Features
| Feature | Description |
|---------|-------------|
| **RESTful API** | 15+ production-ready endpoints |
| **SMPP v3.4** | Direct carrier connections via SMPP protocol |
| **Webhook Support** | Real-time notifications for incoming messages |
| **Carrier Detection** | Automatic routing to MTN, Airtel, Safaricom |
| **SQLite Database** | Lightweight, zero-configuration persistence |

---

## 🌍 Supported Countries & Carriers

| Country | Carriers | Prefixes |
|---------|----------|----------|
| 🇺🇬 **Uganda** | MTN Uganda, Airtel Uganda, Africell Uganda | 078, 079, 077, 074, 076, 070, 075 |
| 🇰🇪 **Kenya** | Safaricom, Airtel Kenya | 07, 01 |
| 🇹🇿 **Tanzania** | Vodacom, Tigo, Airtel Tanzania | 068, 076, 065, 067, 069 |
| 🇷🇼 **Rwanda** | MTN Rwanda | 078, 072 |
| 🇧🇮 **Burundi** | Lycamobile | 069 |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/kmuwanga83/SemaSMS.git
cd SemaSMS

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start the API server
npm start

# In another terminal, start the SMSC server
npm run smsc
