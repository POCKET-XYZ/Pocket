import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, PRIVACY_EMAIL } from '@/components/legal-page';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary={
        <>
          <p className="font-semibold">The short version</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              We use your data to run your account, verify you, publish your profile, and run
              escrows and disputes. Nothing else.
            </li>
            <li>We do not sell your data, show ads, or track you across other sites.</li>
            <li>
              Your wallet address and your escrow payments are on a public blockchain, where
              nobody can delete them.
            </li>
            <li>
              You can download your data and delete your account from your{' '}
              <Link href="/account">account page</Link>. For anything else, a person handles
              your request at {PRIVACY_EMAIL}.
            </li>
          </ul>
        </>
      }
    >
      <h2>1. Who is responsible for your data</h2>
      <p>
        Pocket (&quot;Pocket&quot;, &quot;we&quot;) is responsible for the personal data
        described here. Pocket is operated by its founding team while a legal entity is being
        incorporated. Until then, its founders are the controllers of your data. Once the entity
        exists, it will be the controller, and we will publish here its legal name, registered
        address and the contact of its data protection officer. You can reach us about privacy
        at {PRIVACY_EMAIL}.
      </p>
      <p>
        This Policy applies to everyone who uses Pocket, in any country. Where the law of your
        country gives you more rights than this Policy, you have them.
      </p>

      <h2>2. What we collect</h2>
      <h3>What you give us</h3>
      <ul>
        <li>
          <strong>Account:</strong> your Stellar wallet address and your role, startup or
          specialist. If you sign in through Pollar, also your email and how you signed in, for
          example Google, and your Pollar user identifier.
        </li>
        <li>
          <strong>Verification:</strong> your full name, contact email and country, and
          optionally your LinkedIn, your website and a note. Startups also give their company
          name and, optionally, its registration number.
        </li>
        <li>
          <strong>Specialist profile:</strong> name, headline, bio, categories, skills, tools,
          years of experience, languages, time zone, weekly availability, hourly rate, smallest
          project, location, past work with its links and results, and links to your portfolio,
          LinkedIn and CV, or the CV you upload as a PDF.
        </li>
        <li>
          <strong>Startup profile:</strong> company name, legal name, one-line description,
          description, sector, stage, what it is looking for, website, logo, languages,
          location and the role of its contact person.
        </li>
        <li>
          <strong>Marketplace activity:</strong> the jobs you post, your applications, offers,
          contracts, milestones, deliveries and their links, feedback, disputes, evidence and
          comments.
        </li>
      </ul>
      <h3>What we collect automatically</h3>
      <ul>
        <li>
          <strong>Security data:</strong> when a request is refused (not signed in, not allowed,
          or too many requests) and on security events such as sign-ins, sign-outs, account
          deletion and data exports, we log your IP address, the request method and path, your
          user identifier and the time. To limit abuse we count requests per IP address or
          account, in memory, for about a minute.
        </li>
        <li>
          <strong>Consent records:</strong> which version of our Terms and of this Policy you
          accepted, when, and from which IP address.
        </li>
        <li>
          <strong>Records we create:</strong> the result of your verification review and the
          reviewer&apos;s notes, and the history of the blockchain transactions made through
          Pocket for your account.
        </li>
        <li>
          <strong>On your device:</strong> your session token and, if you use a browser wallet,
          its address and name, stored in your browser&apos;s local storage. They are strictly
          necessary for the Service to work. We use no cookies for advertising, no tracking and
          no analytics. Pollar and wallet extensions may store their own data under their own
          policies.
        </li>
      </ul>
      <p>
        We do not ask for sensitive data, such as health, ethnic origin, religion, political
        views, union membership or sexual life, and we ask you not to include it anywhere in
        Pocket (see section 4).
      </p>

      <h2>3. Why we use it, and on what basis</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-navy">
              <th className="py-2 pr-4 font-semibold">Data</th>
              <th className="py-2 pr-4 font-semibold">What for</th>
              <th className="py-2 font-semibold">Legal basis</th>
            </tr>
          </thead>
          <tbody className="align-top [&_td]:py-2 [&_td]:pr-4 [&_tr]:border-b [&_tr]:border-border">
            <tr>
              <td>Wallet address, role, Pollar email and provider</td>
              <td>Create and secure your account, and sign you in</td>
              <td>Our contract with you</td>
            </tr>
            <tr>
              <td>Verification data</td>
              <td>
                Verify people and companies and prevent fraud, including refusing a hire between
                two accounts verified with the same email
              </td>
              <td>
                Our contract; our legitimate interest in a trustworthy marketplace; legal
                obligations
              </td>
            </tr>
            <tr>
              <td>Profile, including the CV</td>
              <td>Publish your profile so others can find and hire you</td>
              <td>Our contract; your consent to publish your profile and CV</td>
            </tr>
            <tr>
              <td>Marketplace activity, contact email shared with the other party</td>
              <td>Run Engagements, escrows, payments and disputes</td>
              <td>Our contract</td>
            </tr>
            <tr>
              <td>Security data</td>
              <td>Protect accounts, prevent abuse and investigate incidents</td>
              <td>Legitimate interest; legal obligations</td>
            </tr>
            <tr>
              <td>Consent records</td>
              <td>Prove what you accepted and when</td>
              <td>Legal obligation; defence of legal claims</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        We do not use your data for marketing, advertising or profiling, and we do not sell it.
        Fields marked optional can be left blank at no cost to you. Without the required data we
        cannot create your account, verify you, or let you hire or be hired.
      </p>
      <h3>Consent, and how to withdraw it</h3>
      <p>
        When you create your account we ask, separately from the Terms, for your consent to
        process your data as this Policy describes, including publishing your profile and CV
        once you are verified, and transferring your data abroad (section 6). You can withdraw
        it at any time by deleting your CV or your profile, by deleting your account from your{' '}
        <Link href="/account">account page</Link>, or by writing to {PRIVACY_EMAIL}. Withdrawing
        does not affect what was done before. If the consent was needed for a feature, we will
        have to stop that feature for you.
      </p>
      <h3>Automated decisions</h3>
      <p>
        Most decisions about you, such as approving a verification or resolving a dispute, are
        made by people. Two are made automatically: we refuse a hire between two accounts
        verified with the same email, to prevent self-dealing; and we temporarily block requests
        that exceed our rate limits. If you think either affected you wrongly, write to{' '}
        {PRIVACY_EMAIL} and a person will review it.
      </p>

      <h2>4. Public profiles and sensitive data</h2>
      <p>
        Once you are verified, your profile, including any CV you upload, is public: anyone can
        see it, and download the CV, without an account. We ask search engines not to index
        specialist profiles and CVs, but copies made by others are outside our control. Profiles
        show a shortened wallet address, not the full one.
      </p>
      <p>
        <strong>Do not include sensitive data in your profile or CV</strong>: photos, date of
        birth, identity document numbers, home address, health, ethnic origin, religion,
        political views, union membership, sexual life or financial details. If we find it, we
        may ask you to remove it or remove it ourselves. You can replace or delete your CV at any
        time.
      </p>

      <h2>5. Who can see your data</h2>
      <ul>
        <li>
          <strong>Anyone:</strong> the public profiles of verified users, the CVs they upload,
          and the jobs startups publish.
        </li>
        <li>
          <strong>The other party of an Engagement:</strong> your application, your deliveries
          and your comments, and, once the specialist accepts the terms, your contact email.
        </li>
        <li>
          <strong>Pocket managers</strong>, on a need-to-know basis: verification requests and
          their review notes, and everything in a dispute.
        </li>
        <li>
          <strong>Service providers</strong> that process data on our instructions: Supabase
          (database, United States), Railway (API hosting and its logs), Vercel (website
          hosting), and Trustless Work (builds the escrow transactions, with wallet addresses,
          amounts and milestones). Our private security alerts, sent to a Discord channel,
          contain only technical data about Pocket&apos;s own account, never your name, email
          or wallet.
        </li>
        <li>
          <strong>Independent parties</strong> with their own privacy policies: Pollar, which
          creates and holds wallets for email and Google sign-ins and knows your email; Google,
          if you sign in with it; the Stellar network, which is public; and Circle, which issues
          USDC.
        </li>
        <li>
          <strong>Authorities</strong>, when the law requires it, or to protect the rights and
          safety of users or of Pocket.
        </li>
      </ul>

      <h2>6. International transfers</h2>
      <p>
        Your data is stored in the United States (Supabase, us-west-2) and processed by the
        providers listed above, in the United States and elsewhere. We transfer it because it is
        necessary to perform our contract with you and with your consent, and we will put in
        place with our providers the safeguards the law of your country requires, such as
        standard contractual clauses. You can ask us for a copy of those safeguards at{' '}
        {PRIVACY_EMAIL}. Blockchain data is replicated worldwide by the Stellar network, which
        is not a transfer we control (section 7).
      </p>

      <h2>7. What is on the blockchain</h2>
      <p>
        Your wallet address is personal data, because Pocket links it to your account. Each
        escrow is a public smart contract on Stellar that stores the full wallet addresses of
        the startup and the specialist, the milestone amounts, the status of the escrow and an
        identifier of the Engagement. Every deposit, approval, release and dispute resolution is
        a public transaction. Anyone can read this data, and anyone who knows your address, or
        sees it next to your name, can link those payments to you.
      </p>
      <p>
        The Stellar network, not Pocket, keeps this record, and nobody can change or delete it,
        including us. When you delete your account, we delete what we hold outside the
        blockchain and the link between your identity and your address, but the record on the
        blockchain stays. To limit this, you can use a wallet you do not use for anything else.
        Pollar and Circle can also see your activity on the blockchain, and Circle can freeze
        USDC at an address under its own terms.
      </p>

      <h2>8. How long we keep it</h2>
      <ul>
        <li>
          <strong>Profile and CV:</strong> until you change or delete them, or delete your
          account.
        </li>
        <li>
          <strong>Verification data:</strong> until you delete your account.
        </li>
        <li>
          <strong>Contracts, payments, disputes, evidence and consent records:</strong> while
          your account is open and afterwards for as long as commercial, tax and limitation
          periods require, up to 10 years after the Engagement ends. When you delete your
          account they stay attached to an anonymous account, because they are also the
          records of the other party.
        </li>
        <li>
          <strong>Security logs:</strong> up to 30 days, in our hosting provider.
        </li>
        <li>
          <strong>Sign-in challenges:</strong> minutes. They are deleted once used or expired.
        </li>
      </ul>
      <p>
        When a period ends we delete or anonymize the data. Blockchain records are permanent
        (section 7).
      </p>

      <h2>9. Your rights</h2>
      <p>
        Depending on where you live, you can: access your data and get a copy; correct it;
        delete it; object to a use of it, or ask us to limit it; receive it in a portable
        format; withdraw a consent you gave; ask which providers we share it with; and ask for a
        person to review an automated decision. In Mexico these are your ARCO rights.
      </p>
      <ul>
        <li>
          <strong>Yourself, at any time:</strong> download all your data, and delete your
          account, from your <Link href="/account">account page</Link>. Correct your profile
          from your <Link href="/profile">profile page</Link>.
        </li>
        <li>
          <strong>Anything else:</strong> write to {PRIVACY_EMAIL} from the email linked to your
          account, or prove that you control your wallet by signing a message we send you. Tell
          us your wallet address, the right you want to use and, for a correction, the correct
          data. We may ask for proof of identity, and someone acting for you must prove they can.
        </li>
      </ul>
      <p>
        Using your rights is free. We answer within the shortest period your law sets, and never
        later than 15 business days. If we must keep some data, we will tell you which data and
        why. Data on the blockchain cannot be deleted by anyone.
      </p>

      <h2>10. How we protect it</h2>
      <p>
        Data is encrypted in transit, between your browser and Pocket and between Pocket and its
        database, and at rest by our database provider. Only the Pocket API and a small number
        of authorized administrators can access the database. Sessions last up to 12 hours and
        can be revoked. Session tokens are kept in your browser&apos;s local storage, which
        protects them less than a secure cookie would. No system is perfectly secure. If a
        breach creates a relevant risk for you, we will notify you and the competent authorities
        within the time the law requires, explaining what happened, what data was affected and
        what you can do.
      </p>

      <h2>11. Children</h2>
      <p>
        Pocket is only for people aged 18 or over, and we do not knowingly collect data from
        minors. If you believe a minor has given us data, write to {PRIVACY_EMAIL} and we will
        delete it.
      </p>

      <h2>12. Complaints</h2>
      <p>
        Please write to us first, so we can try to solve it. You can also complain to the data
        protection authority of your country, for example: in Brazil, the ANPD; in Mexico, the
        authority designated under its federal data protection law; in Colombia, the
        Superintendencia de Industria y Comercio; in Argentina, the Agencia de Acceso a la
        Información Pública; in Chile, the Agencia de Protección de Datos Personales once it is
        in operation, and the courts until then; in Peru, the Autoridad Nacional de Protección
        de Datos Personales; in Costa Rica, PRODHAB; in Ecuador, the Superintendencia de
        Protección de Datos Personales; in Uruguay, the URCDP; and in Bolivia, the courts,
        through the constitutional action for the protection of privacy.
      </p>

      <h2>13. Users in the European Union, the United Kingdom and elsewhere</h2>
      <p>
        If you are in the European Union, the European Economic Area or the United Kingdom, the
        General Data Protection Regulation, or its United Kingdom version, applies to your data.
        In particular:
      </p>
      <ul>
        <li>
          The legal bases in section 3 are those of the Regulation: performance of a contract,
          legitimate interests, legal obligations and consent.
        </li>
        <li>
          You may object at any time to any use of your data based on our legitimate interests,
          and we will stop unless we have compelling legitimate grounds, or need it to establish
          or defend legal claims.
        </li>
        <li>
          Transfers of your data outside the European Economic Area or the United Kingdom are
          made under the European Commission&apos;s standard contractual clauses, or the United
          Kingdom&apos;s equivalent, with our providers.
        </li>
        <li>
          None of the automated decisions in section 3 produces legal effects on you or
          significantly affects you in a similar way; you can still ask a person to review them.
        </li>
        <li>
          If we offer Pocket to people in the European Union or the United Kingdom, we will
          appoint a representative there, as the Regulation requires, and publish its details
          here.
        </li>
        <li>
          You may complain to the data protection authority of the country where you live or
          work, or where you think your rights were infringed; in the United Kingdom, the
          Information Commissioner&apos;s Office.
        </li>
      </ul>
      <p>
        If you live in the United States, we do not sell your personal information or share it
        for cross-context behavioural advertising, and you can use the rights your state gives
        you in the same way as those in section 9. Wherever you live, we handle your data as
        this Policy describes, and you can use the rights in section 9.
      </p>

      <h2>14. Changes to this Policy</h2>
      <p>
        We may update this Policy. The version in force is shown at the top, with its date. We
        will give at least 15 days&apos; notice of material changes, in the Service and by email
        where we have yours, and ask you to accept them before you keep using Pocket.
      </p>

      <h2>15. Contact</h2>
      <p>For anything about your data, write to {PRIVACY_EMAIL}.</p>
    </LegalPage>
  );
}
