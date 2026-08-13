import type { Metadata } from 'next'
import { LegalPage, type LegalSection } from '@/components/store/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy · SquareOne Interactive',
  description: 'What information SquareOne Interactive collects, why, who sees it, and how to get it deleted.',
}

const UPDATED = 'August 13, 2026'

const SECTIONS: LegalSection[] = [
  {
    id: 'scope',
    heading: 'What this covers',
    paragraphs: [
      'SquareOne Interactive is operated by SquareOne Compassion, a 501(c)(3) nonprofit in Tulsa, Oklahoma. This policy explains what we collect through our website and at our facility, why we collect it, who we share it with, and what you can ask us to do about it.',
      'The short version: we collect what we need to run memberships, bookings, and the building safely. We do not sell your information to anyone, and we do not use it for advertising.',
    ],
  },
  {
    id: 'what-we-collect',
    heading: 'What we collect',
    paragraphs: [
      'Information you give us:',
      [
        'Account details — name, email address, and the names of family members on your account.',
        'Membership and booking details — the plan you chose, the spaces you booked, dates and times, add-ons, and notes about your event.',
        'Waiver records — the participant name, who signed, and when.',
        'Messages you send us.',
      ],
      'Information created as you use the facility:',
      [
        'Check-in and check-out times, which door was used, and how entry happened (front desk, app unlock, or self check-in).',
        'Payment records — amount, method, date, what it was for, and which staff member handled it. Card numbers are handled entirely by Stripe; we only ever see the last four digits and a reference token.',
        'Basic technical information your browser sends, such as your IP address, used to keep the site secure.',
      ],
      'We do not collect biometric data, we do not track your location, and we do not run advertising trackers on this site.',
    ],
  },
  {
    id: 'why',
    heading: 'Why we use it',
    paragraphs: [
      'We use your information to:',
      [
        'Run your membership and process recurring payments.',
        'Take, confirm, and keep track of bookings, and send you confirmations and receipts.',
        'Unlock the door for you and know who is in the building — which matters in an emergency.',
        'Keep required waiver records for safety and insurance.',
        'Answer your questions and contact you about a booking or your account.',
        'Keep our own books, meet our obligations as a nonprofit, and report anonymized totals — like attendance counts — to our board and grant funders.',
      ],
      'We never use your information to make automated decisions about you, and we do not profile you for marketing.',
    ],
  },
  {
    id: 'children',
    heading: 'Children\'s information',
    paragraphs: [
      'Children come to our facility, and we keep some information about them: a name on an account or waiver, and check-in records. That information is provided by a parent or guardian, not collected from the child.',
      'Our website is not directed to children under 13, and children cannot create accounts. We do not knowingly collect personal information online directly from a child under 13.',
      'If you believe a child has given us information directly, email us and we will delete it promptly.',
    ],
  },
  {
    id: 'sharing',
    heading: 'Who we share it with',
    paragraphs: [
      'We do not sell your personal information, and we do not rent or trade mailing lists. We share information only with the services that make the facility run:',
      [
        'Stripe — payment processing. They receive your name, email, and payment details directly.',
        'Supabase — the secure database that stores account, booking, and check-in records.',
        'Resend — sends confirmation and receipt emails on our behalf.',
        'Vercel — hosts the website.',
        'Our door access system — receives a confirmation that a current member requested entry, and logs it.',
      ],
      'Each of these providers is contractually limited to handling data on our behalf. We may also disclose information when the law requires it, or when it is genuinely necessary to protect someone\'s safety.',
      'If SquareOne Compassion ever merges with or transfers this program to another organization, account records may transfer with it, and we would tell you first.',
    ],
  },
  {
    id: 'email',
    heading: 'Emails you get from us',
    paragraphs: [
      'Two kinds of email come from us. Transactional emails — booking confirmations, receipts, membership changes, refunds — are part of the service, and you cannot opt out of them while you hold an account or a booking, because they are the record of what you bought.',
      'Announcements and news are different. Every one includes an unsubscribe link, and you can also just reply and ask us to stop.',
    ],
  },
  {
    id: 'retention',
    heading: 'How long we keep it',
    paragraphs: [
      'We keep account and booking records for as long as you have an account with us, and afterward only as long as we need them.',
      'Some records we must keep longer: financial and payment records for at least seven years for tax and audit purposes, and signed waivers for the period our insurer and Oklahoma law require. Check-in logs are kept for operational history and reporting.',
      'When a retention period ends, we delete the record or strip it of anything that identifies you.',
    ],
  },
  {
    id: 'security',
    heading: 'How we protect it',
    paragraphs: [
      'Data is encrypted in transit and at rest with our hosting providers. Access is restricted by role — front-desk staff see what they need to serve you at the counter, while financial settings and company records are limited to owners and admins. Every payment, refund, and door unlock is logged with the staff member who did it.',
      'No system is perfectly secure. If a breach ever affects your personal information, we will notify you promptly and tell you plainly what happened.',
    ],
  },
  {
    id: 'your-choices',
    heading: 'Your choices',
    paragraphs: [
      'You can, at any time:',
      [
        'See and correct your account information from your account page, or ask us to correct it.',
        'Ask for a copy of the personal information we hold about you.',
        'Ask us to delete your account. We will delete what we are not legally required to keep, and tell you exactly what has to stay and why.',
        'Cancel your membership yourself from your account page.',
        'Unsubscribe from announcements.',
      ],
      'Email info@squareoneinteractive.com for any of these. We respond within 30 days, and there is no charge.',
    ],
  },
  {
    id: 'cookies',
    heading: 'Cookies',
    paragraphs: [
      'We use only the cookies needed to keep you signed in and keep your session secure. We do not use advertising cookies, and we do not allow third-party trackers on this site.',
    ],
  },
  {
    id: 'changes',
    heading: 'Changes to this policy',
    paragraphs: [
      'If we change this policy, we will update the date at the top of the page. For changes that meaningfully affect how we handle your information, we will email account holders before the change takes effect.',
    ],
  },
  {
    id: 'contact',
    heading: 'How to reach us',
    paragraphs: [
      'Questions, concerns, or requests about your information: info@squareoneinteractive.com, or stop by the front desk. We would rather hear from you directly than have you wonder.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={UPDATED}
      intro="What we collect, why we collect it, and what you can ask us to do about it. We do not sell your information, and we do not use it for advertising."
      sections={SECTIONS}
    />
  )
}
