import type { Metadata } from 'next'
import { LegalPage, type LegalSection } from '@/components/store/LegalPage'

export const metadata: Metadata = {
  title: 'Terms of Service · SquareOne Interactive',
  description: 'The rules for using SquareOne Interactive — memberships, room rentals, parties, payments, and conduct.',
}

const UPDATED = 'August 13, 2026'

const SECTIONS: LegalSection[] = [
  {
    id: 'who-we-are',
    heading: 'Who we are',
    paragraphs: [
      'SquareOne Interactive is a family entertainment and fitness center in Tulsa, Oklahoma, operated by SquareOne Compassion, a 501(c)(3) nonprofit organization. In these terms, "we," "us," and "SquareOne" mean SquareOne Compassion and its SquareOne Interactive facility. "You" means anyone who uses our website, books a space, buys a membership, or comes into the building.',
      'By creating an account, buying a membership, booking a room, or entering the facility, you agree to these terms. If you do not agree, please do not use the service.',
    ],
  },
  {
    id: 'accounts',
    heading: 'Your account',
    paragraphs: [
      'You need an account to book spaces, buy a membership, or check in. You must be at least 18 years old to create one. Everything you tell us must be accurate — especially names, email addresses, and emergency contacts, because we rely on them to reach you.',
      'A household can share one account. The account holder is responsible for everyone listed on it, including keeping their information current, making sure required waivers are signed, and any charges the account incurs. Do not share your password outside your household.',
      'Tell us right away if you believe someone else has access to your account.',
    ],
  },
  {
    id: 'memberships',
    heading: 'Fitness memberships',
    paragraphs: [
      'Fitness memberships bill automatically on a recurring basis — monthly or yearly, depending on the plan you pick — using the card you provide. By joining, you authorize us to charge that card each billing period until you cancel.',
      'You can change your plan at any time from your account. Upgrades and downgrades take effect immediately and your next bill is prorated accordingly.',
      'You can cancel at any time from your account page. Cancellation stops future billing; your membership stays active through the end of the period you already paid for, and we do not prorate refunds for a partial period unless we choose to make an exception.',
      'If a payment fails, we will email you and retry. We may suspend membership benefits, including door access, while an account is past due.',
      'Membership benefits — including facility access, door entry, and member pricing — are personal to the people on your account and may not be transferred, shared, or sold.',
      'We may change membership pricing or benefits. If we do, we will give you at least 30 days\' notice by email before the change affects your billing, and you can cancel before it takes effect.',
    ],
  },
  {
    id: 'bookings',
    heading: 'Room rentals, parties, and packages',
    paragraphs: [
      'When you book a space online, you receive a hold, not a confirmed reservation. A hold becomes a confirmed booking once the required deposit or full payment is received. Unpaid holds expire automatically, generally within 24 hours, and the time returns to the calendar.',
      'Rooms and event spaces normally require advance notice to book online — 48 hours unless posted otherwise for a particular space. For anything shorter, call the front desk and we will help if staffing allows.',
      'Prices are shown before you book and can vary by room, day of the week, time of day, and rental length. Add-ons such as inflatables or photo booths are limited equipment: booking one reserves it for your time slot, and it cannot be double-booked.',
      'Your rental covers only the space, times, and add-ons listed on your confirmation. Please arrive and vacate on time — another party may be scheduled right after you, and staying past your window may incur an additional hourly charge.',
      'Capacity limits posted for each space are firm; they exist for safety and insurance reasons.',
    ],
  },
  {
    id: 'payments',
    heading: 'Payments, deposits, and refunds',
    paragraphs: [
      'We accept cards, cash, and Cash App. Card payments are processed by Stripe; we never see or store your full card number.',
      'Deposits hold your reservation and are applied to your final balance. Any remaining balance is due before or at the time of your event unless we have agreed otherwise in writing.',
      'Refunds are issued at our discretion, in whole or in part, and are returned by the same method you paid. Card refunds typically take 5–10 business days to appear on your statement, depending on your bank.',
      'Our general practice on cancellations is:',
      [
        'Cancel more than 7 days before your event: full refund of what you have paid.',
        'Cancel 3–7 days before: refund less the deposit, which covers the time the space was held off the calendar.',
        'Cancel less than 72 hours before, or do not show up: no refund, though we will do our best to rebook you for another date.',
        'If we cancel — for weather, a facility problem, or anything on our end — you receive a full refund or a reschedule, your choice.',
      ],
      'We will always talk with you about genuine emergencies. These are our standard practices, not a promise that we cannot make exceptions.',
    ],
  },
  {
    id: 'waivers',
    heading: 'Waivers, minors, and safety',
    paragraphs: [
      'Some activities and spaces require a signed liability waiver before participating. We will tell you which ones during booking or signup, and everyone taking part must have a current waiver on file.',
      'A parent or legal guardian must sign on behalf of anyone under 18. Children must be supervised according to the posted rules for each area. For most party spaces we require a responsible adult to remain on site for the entire rental.',
      'Follow posted rules and staff instructions at all times. We may refuse entry to, or remove, anyone who behaves unsafely, is under the influence, harasses others, damages property, or ignores staff — without a refund.',
      'Use of our fitness equipment and play areas involves inherent physical risk. Talk to your doctor before starting an exercise program. Do not use equipment you have not been shown how to use safely.',
    ],
  },
  {
    id: 'door-access',
    heading: 'Door access and check-in',
    paragraphs: [
      'Active fitness members can unlock the fitness entrance from their account and check themselves in and out. That access is personal to the people on your account.',
      'Do not let anyone else in behind you and do not let another person use your account to enter. Door access is logged, and misuse may end your membership without a refund.',
      'Door access stops when a membership is canceled, expires, or falls past due.',
    ],
  },
  {
    id: 'conduct',
    heading: 'Acceptable use of this website',
    paragraphs: [
      'Please do not attempt to break into other people\'s accounts, interfere with the site, scrape it in bulk, or use it to send anyone spam or abuse. Do not book spaces you do not intend to use, and do not use the site for anything unlawful.',
      'We may suspend or close an account that violates these terms.',
    ],
  },
  {
    id: 'liability',
    heading: 'Limits on our responsibility',
    paragraphs: [
      'We work hard to keep the facility safe and the website working, but we provide both "as is." We do not promise the website will be uninterrupted or error-free.',
      'To the fullest extent Oklahoma law allows, our total liability to you for any claim connected to your use of the website, a membership, or a booking is limited to the amount you paid us for the membership period or booking the claim relates to. We are not liable for indirect or consequential losses, such as lost time or the cost of an alternative venue.',
      'Nothing in these terms limits liability that cannot legally be limited, including liability for gross negligence or willful misconduct. This section does not replace any separate waiver you sign — where a waiver applies, both documents operate together.',
      'We are not responsible for personal property that is lost, stolen, or damaged on our premises. Please keep your belongings with you.',
    ],
  },
  {
    id: 'changes',
    heading: 'Changes to these terms',
    paragraphs: [
      'We may update these terms as the facility and its programs change. When we do, we will update the date at the top of this page, and for significant changes we will email account holders.',
      'Continuing to use your account or the facility after a change means you accept the updated terms.',
    ],
  },
  {
    id: 'law',
    heading: 'Governing law and disputes',
    paragraphs: [
      'These terms are governed by the laws of the State of Oklahoma, without regard to its conflict-of-laws rules. Any dispute will be brought in the state or federal courts located in Tulsa County, Oklahoma.',
      'Before filing anything, please talk to us. Almost everything gets resolved with a phone call or an email, and we would rather fix a problem than argue about it.',
    ],
  },
  {
    id: 'contact',
    heading: 'How to reach us',
    paragraphs: [
      'Questions about these terms, your account, a booking, or a refund can go to info@squareoneinteractive.com, or you can call or visit the front desk during open hours. A person reads every message.',
    ],
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={UPDATED}
      intro="These terms cover how memberships, room rentals, and parties work at SquareOne Interactive — what you can expect from us, and what we ask of you. We have tried to write them in plain English rather than legal fog."
      sections={SECTIONS}
    />
  )
}
