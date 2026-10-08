# PayPulse

PayPulse is a bilingual invoice tool for solo freelancers in Myanmar. It creates MMK invoices with a personal payment QR, exports a PDF, and prepares text to share in Telegram or Viber.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in a browser.

## MVP features

- Create invoices with multiple line items, client details, MMK totals, and a due date.
- Add a freelancer name, phone number, logo, payment method, account number, and payment QR.
- Switch the app language and invoice language independently between Myanmar and English.
- Download an invoice as a PDF or PNG image and share invoice text through Telegram, Viber, email, or the clipboard. To send a viewable picture in Telegram or Viber, download the PNG and attach it in the chat. Email opens the device's configured email app with the client address and invoice text filled in; attach the downloaded file manually.
- Track invoices on this device and manually mark them paid or pending. Unpaid invoices past their due date show as overdue.
- Download and restore a JSON backup.

## Data and payment notes

Invoice data, settings, logos, and QR images are stored in this browser using IndexedDB. They are not synced to a server, so export a backup before clearing browser data or changing devices. Restoring a backup replaces the data currently stored in this browser.

Payment QR codes are included for the client to pay manually. PayPulse does not verify payments, send automatic reminders, or send invoices as attachments. Telegram and Viber open a share screen for the invoice text; choose a recipient and send it there. To share an invoice as a picture that can be viewed directly in chat, download the PNG image and attach it yourself. Email opens the configured email app with the recipient and invoice text filled in; attach the downloaded PDF or image before sending. Messaging and email app behavior depends on the device and installed/configured apps.

PDF content is rendered by the browser before export. Myanmar font availability depends on the device; verify a sample PDF on the devices your clients use before relying on it for official billing.