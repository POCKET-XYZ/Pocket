import type { Metadata } from 'next';
import Link from 'next/link';
import { TRUSTLESS_WORK_FEE_PERCENT } from '@pocket/shared';
import { LEGAL_EMAIL, LegalPage } from '@/components/legal-page';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary={
        <>
          <p className="font-semibold">The short version</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Pocket connects startups with growth, sales and marketing specialists. The work
              agreement is between them. Pocket is not a party to it and employs no one.
            </li>
            <li>
              Payments sit in escrow smart contracts on the Stellar network. Pocket does not
              hold your funds or your wallet&apos;s keys, but Pocket&apos;s own account controls
              when escrowed funds are released and how disputed funds are split.
            </li>
            <li>
              A milestone is released when the startup approves it. If there is a dispute, a
              Pocket manager decides it, and that decision is final for the funds in escrow.
            </li>
            <li>
              Pocket runs on the Stellar <strong>test network</strong> today. Test USDC has no
              value.
            </li>
            <li>
              Blockchain transactions cannot be undone. Keep your wallet safe and check what you
              sign.
            </li>
            <li>
              If you are a consumer, the consumer protection law of your country applies, and
              nothing here takes those rights away.
            </li>
          </ul>
          <p className="mt-3">This summary helps you read the Terms. It does not replace them.</p>
        </>
      }
    >
      <h2>1. Who we are and what these Terms cover</h2>
      <p>
        Pocket (&quot;Pocket&quot;, &quot;we&quot;, &quot;us&quot;) is an online marketplace
        available on the Pocket website and any site or app we run under the Pocket name (the
        &quot;Service&quot;). Pocket is operated by its founding team while a legal entity is
        being incorporated. Once it exists, that entity will operate the Service and be the
        party to these Terms, and we will identify it here with its registered address.
      </p>
      <p>
        These Terms of Service (the &quot;Terms&quot;) are a binding agreement between you and
        Pocket. You accept them when you create an account, by ticking the box that says so.
        Our <Link href="/privacy">Privacy Policy</Link> explains how we handle personal data.
        If you do not agree with these Terms, do not use the Service.
      </p>

      <h2>2. Who can use Pocket</h2>
      <ul>
        <li>You must be at least 18 years old and able to enter into a binding contract.</li>
        <li>
          If you use Pocket for a company, you confirm you are allowed to bind it, and
          &quot;you&quot; includes that company.
        </li>
        <li>
          You may not use Pocket if you are subject to sanctions (see section 13), or if using
          it is against the law where you live.
        </li>
        <li>One person or company, one account, unless we agree otherwise.</li>
      </ul>

      <h2>3. Your account and your wallet</h2>
      <p>
        Your Stellar wallet is your account. You can sign in with a wallet you hold yourself,
        such as Freighter, xBull or Lobstr, or through Pollar, a third-party service that
        creates a wallet for you when you sign in with email or Google.
      </p>
      <ul>
        <li>
          <strong>Your own wallet:</strong> only you hold its keys. Pocket cannot recover a lost
          key, reverse a transaction or move funds for you.
        </li>
        <li>
          <strong>A Pollar wallet:</strong> Pollar, a third party, creates the wallet and keeps
          its keys on your behalf. Access depends on your Pollar login and on Pollar&apos;s
          service. Pocket cannot access, recover or move funds in a Pollar wallet. Pollar&apos;s
          own terms and policies, if any, apply to it.
        </li>
        <li>
          You are responsible for everything done with your account and for keeping your
          devices, keys and logins secure. Tell us at once at {LEGAL_EMAIL} if you think someone
          else is using your account.
        </li>
        <li>
          You choose your role, startup or specialist, when you create the account, and it
          cannot be changed later.
        </li>
      </ul>

      <h2>4. Verification</h2>
      <p>
        To post jobs or apply to them, you must be verified. You agree to give us true, current
        and complete information and to keep it up to date. We may approve or reject a request,
        ask for more information, or withdraw a verification, and we will tell you why when we
        can.
      </p>
      <p>
        Verification means a person at Pocket reviewed the information you gave us. It is not
        a guarantee of anyone&apos;s identity, skills, solvency or conduct, and it is not an
        endorsement. Use your own judgment before hiring or working with someone.
      </p>

      <h2>5. What Pocket is, and what it is not</h2>
      <p>
        Pocket is a venue. Startups publish jobs, specialists apply, and a startup can hire a
        specialist under the terms and milestones they agree on (an &quot;Engagement&quot;).
      </p>
      <ul>
        <li>
          The Engagement is a contract between the startup and the specialist. Pocket is not a
          party to it.
        </li>
        <li>
          Specialists are independent. Pocket is not their employer, agent or partner, and does
          not direct or supervise their work. Pocket&apos;s verification, dispute handling and
          product features are not direction or control of anyone&apos;s work.
        </li>
        <li>
          Startups are solely responsible for correctly classifying the people they hire under
          the labour law that applies to them.
        </li>
        <li>
          Pocket does not guarantee the quality, legality, timing or results of any work, nor
          that a job will be filled or an application accepted.
        </li>
        <li>
          Each party is responsible for issuing any invoices or tax receipts the law requires,
          for any tax withholding, and for reporting its own income. Pocket does not issue
          invoices for Engagements or withhold taxes, but may have to report information to tax
          authorities where the law requires it.
        </li>
      </ul>

      <h2>6. Payments and escrow</h2>
      <h3>How escrow works</h3>
      <p>
        When a startup hires a specialist and the specialist accepts, an escrow smart contract
        is deployed on the Stellar network through Trustless Work, a third-party escrow
        protocol. The startup deposits the agreed amount in USDC, a stablecoin issued by
        Circle, into that contract. The contract holds the funds, not Pocket.
      </p>
      <ul>
        <li>
          Every deposit, approval and dispute is signed by the user&apos;s own wallet. Pocket
          signs only the transactions of its own escrow roles: creating escrows, releasing
          approved milestones and executing dispute decisions. It never signs deposits,
          approvals or disputes on your behalf.
        </li>
        <li>
          When the startup approves a milestone, Pocket releases that milestone&apos;s payment
          to the specialist. Approval cannot be undone: once approved, the milestone is released
          and the funds leave the escrow. By approving, the startup confirms the milestone was
          delivered to its satisfaction.
        </li>
        <li>
          There is no automatic release. If a startup neither approves nor disputes a
          milestone, its funds stay in escrow until one of the parties opens a dispute.
        </li>
        <li>Releases may take some time to be signed and confirmed on the network.</li>
      </ul>
      <h3>Pocket&apos;s roles in the escrow</h3>
      <p>
        Pocket does not take custody of your funds. However, Pocket&apos;s Stellar account
        holds the escrow roles that release a milestone after the startup approves it and that
        resolve disputes. The smart contract itself would carry out any dispute resolution
        Pocket signs, including a payment to any address. Pocket commits, and its systems are
        built, to direct escrowed funds only to the startup or the specialist of that
        Engagement, in the amounts shown in the Engagement or decided under section 7. If the
        keys of Pocket&apos;s account were compromised, escrowed funds could be at risk. Pocket
        protects those keys with reasonable security measures and monitors their use, and will
        notify affected users without undue delay of any incident that affects their funds.
      </p>
      <h3>Fees</h3>
      <p>
        Pocket does not charge a platform fee today. Trustless Work keeps{' '}
        {TRUSTLESS_WORK_FEE_PERCENT}% of each amount its escrow pays out, deducted from that
        amount, so the specialist receives the milestone amount minus that fee. The Stellar
        network charges small transaction fees. If Pocket introduces its own fees, we will show
        them clearly before they apply to any new Engagement.
      </p>
      <h3>No refunds by Pocket</h3>
      <p>
        Since Pocket does not hold funds, it cannot refund, reverse or return a payment. Money
        leaves an escrow only through a milestone release or a dispute resolution.
      </p>
      <h3>Payments outside Pocket</h3>
      <p>
        Payments made outside Pocket&apos;s escrow are outside the Service. Pocket cannot help
        with them, will not resolve disputes about them, and they are not covered by these
        Terms.
      </p>

      <h2>7. Disputes between startups and specialists</h2>
      <p>
        Either party can open a dispute on a funded milestone that has not been paid. Its funds
        then stay in escrow until a Pocket manager resolves it. A dispute is the only way the
        funds of an unapproved milestone can move.
      </p>
      <ul>
        <li>
          Both parties can add evidence and comments. Each party will have a reasonable
          opportunity, normally 7 days from the opening of the dispute, to do so.
        </li>
        <li>
          The manager decides on the written terms of the Engagement, what was delivered and
          the evidence given, records a written reason for the decision, and has no personal
          interest in the outcome.
        </li>
        <li>
          The manager may pay the whole milestone to the specialist, return it to the startup,
          or split it between them. Pocket will only direct disputed funds to those two parties.
        </li>
        <li>
          The decision is executed on the escrow and is final for those funds. It is not an
          arbitral award, and it does not prevent either party from bringing any claim against
          the other before the competent courts or authorities.
        </li>
        <li>
          Pocket is not liable for the outcome of a decision made in good faith under this
          section, except for its gross negligence, wilful misconduct, or failure to execute the
          decision as made.
        </li>
      </ul>

      <h2>8. Blockchain and third-party risks</h2>
      <p>By using Pocket you understand and accept that:</p>
      <ul>
        <li>
          Blockchain transactions are public and irreversible. A transaction sent by mistake, or
          to the wrong address, cannot be undone.
        </li>
        <li>
          Smart contracts, networks and wallets can fail, have bugs, be attacked or be
          unavailable, which can delay or prevent payments. Protocol upgrades, forks or changes
          to Trustless Work&apos;s contracts may affect escrows.
        </li>
        <li>
          Circle&apos;s USDC terms govern USDC, and Circle may freeze USDC held at any address,
          including an escrow. Pocket cannot unfreeze such funds. Stablecoins can lose their
          peg.
        </li>
        <li>
          Pocket relies on third parties it does not control, including the Stellar network,
          Trustless Work, Pollar, Circle, wallet providers and hosting providers. Their services
          are governed by their own terms.
        </li>
        <li>
          Your wallet address and your escrow transactions are recorded on a public blockchain,
          where anyone can see them and nobody, Pocket included, can delete them.
        </li>
      </ul>
      <p>
        Pocket gives no financial, investment, legal or tax advice, and nothing in the Service
        is an offer of any financial product.
      </p>

      <h2>9. Test network</h2>
      <p>
        Pocket currently runs on the Stellar test network. Test USDC and test XLM have no value
        and cannot be exchanged for money. Accounts, data and test funds may be reset. Do not
        send real funds or main network assets to any address shown in the Service while it
        runs on the test network: they may be lost. No Engagement on the test network creates
        an obligation to pay real money unless the parties agree otherwise outside Pocket.
        Before Pocket moves to the Stellar main network, where payments use real money, we will
        update these Terms and ask you to accept them again.
      </p>

      <h2>10. Your content</h2>
      <p>
        Your content is what you add to Pocket: your profile, CV, portfolio, jobs, applications,
        deliveries, evidence and comments. You keep ownership of it.
      </p>
      <ul>
        <li>
          You give Pocket a worldwide, non-exclusive, royalty-free licence to host, store, copy,
          display and process your content to run, secure and improve the Service. This licence
          ends when your content is deleted, except for copies we must keep by law, to resolve
          disputes, or as part of the records described in the Privacy Policy.
        </li>
        <li>
          Once you are verified, your public profile, and the CV you upload, are visible to
          anyone. Share in them only what you want others to see.
        </li>
        <li>
          Do not include in your profile or CV photos, identity document numbers, date of birth,
          health data, religious or political beliefs, or other sensitive personal data. Pocket
          may remove such content.
        </li>
        <li>
          You confirm you have the rights to everything you upload, and that it does not
          infringe anyone&apos;s rights or break any law.
        </li>
        <li>
          When a specialist accepts an Engagement, both parties&apos; contact emails are shared
          with each other. Each party may use the other&apos;s data only for that Engagement,
          and is responsible for handling it lawfully.
        </li>
      </ul>

      <h2>11. Work product</h2>
      <p>
        Who owns the work a specialist delivers is agreed between the startup and the
        specialist. If they agreed nothing else in writing, once a milestone is paid in full the
        specialist assigns to the startup, to the extent the applicable law allows, the economic
        rights in that milestone&apos;s deliverables, or, where assignment is not allowed,
        grants the startup an exclusive, worldwide and perpetual licence to them. Moral rights
        stay with the author where the law makes them inalienable. If a dispute ends in a
        partial payment, the startup receives a non-exclusive licence to use the deliverables
        for its own business, unless the parties agree otherwise. The specialist may show the
        work in their portfolio unless the startup asks them in writing not to. Pocket claims
        no rights in the work product.
      </p>

      <h2>12. What you must not do</h2>
      <ul>
        <li>Break any law, or use Pocket for fraud, money laundering or terrorist financing.</li>
        <li>Give false information, impersonate anyone, or create accounts for someone else.</li>
        <li>
          Harass, threaten or discriminate against anyone. Startups must not ask for, or make
          hiring decisions based on, race, ethnicity, colour, gender, sexual orientation,
          religion, disability, age, nationality, pregnancy or other protected characteristics.
        </li>
        <li>
          Post jobs for illegal work, unsolicited bulk messages, deceptive marketing, fake
          reviews, or adult, violent or hateful content.
        </li>
        <li>Upload malware, or anything that infringes intellectual property or privacy.</li>
        <li>
          Interfere with the Service: scraping it, overloading it, bypassing its limits or
          security, or accessing accounts or data that are not yours.
        </li>
        <li>
          Test Pocket&apos;s security without following{' '}
          <a
            href="https://github.com/diegoveme/Pocket/security/policy"
            target="_blank"
            rel="noreferrer"
          >
            our security policy
          </a>
          , which explains how to report a vulnerability.
        </li>
      </ul>
      <h3>Reporting content, and how we moderate</h3>
      <p>
        Anyone can report content or a user they believe is illegal or breaks these Terms by
        writing to {LEGAL_EMAIL}. Please include where the content is, why you believe it is
        illegal or not allowed, your name and email, and a statement that your report is made
        in good faith. We review reports with people, not automated tools, and tell the person
        who reported what we decided.
      </p>
      <p>
        If we remove your content, or restrict or suspend your account, we will tell you what
        we did, why, which rule or law it is based on, and how to ask us to review it. You can
        ask for that review by replying to our message or writing to {LEGAL_EMAIL}, and a
        different person at Pocket will look at it.
      </p>

      <h2>13. Regulatory status, sanctions and anti-money laundering</h2>
      <p>
        Pocket does not buy, sell, exchange or convert digital assets, does not exchange them
        for money, and does not offer investment or deposit products. Pocket is not licensed or
        registered as a financial institution, payment institution or virtual asset service
        provider in any country. If the law of a country requires a licence or registration for
        any part of the Service, Pocket may limit or stop the Service there.
      </p>
      <p>
        You confirm that you are not, and are not owned or controlled by, a person listed on, or
        located in a country subject to, sanctions of the United Nations, the United States, the
        European Union or your country of residence. Pocket may screen users and wallet
        addresses, ask for additional information, refuse or suspend accounts, decline to sign
        releases or resolutions where the law requires it, and report to the competent
        authorities.
      </p>

      <h2>14. Closing your account, and suspension</h2>
      <p>
        You can close your account at any time, from your account page or by writing to{' '}
        {LEGAL_EMAIL}. You can also download a copy of your data there before you close it.
        Closing is not possible while money you are part of is in an escrow: finish or resolve
        those Engagements first. Offers still waiting for the specialist are withdrawn, open
        jobs are closed and pending applications are withdrawn. What happens to your data is
        explained in the Privacy Policy.
      </p>
      <p>
        We may suspend or close an account, remove content, or refuse service if you break
        these Terms, if the law requires it, or to protect users, third parties or Pocket. When
        we can, we will tell you why and give you a chance to respond. Suspending an account
        does not move funds already in an escrow: they stay in the contract, and are released
        or resolved under sections 6 and 7. We may close accounts inactive for 24 months, after
        30 days&apos; notice, but never while funds remain in an escrow.
      </p>

      <h2>15. The Service is provided as is</h2>
      <p>
        To the extent the law allows, the Service is provided &quot;as is&quot; and &quot;as
        available&quot;, without warranties of any kind, express or implied, including fitness
        for a particular purpose, availability, or that it will be free of errors. We may
        change, suspend or discontinue any part of the Service, and will give reasonable notice
        when a change affects funded Engagements.
      </p>

      <h2>16. Limitation of liability</h2>
      <p>
        Nothing in this section limits liability for fraud, wilful misconduct or gross
        negligence, death or personal injury, breach of data protection law, Pocket&apos;s own
        errors in signing a release or a dispute resolution, or any liability that cannot be
        limited under the applicable law.
      </p>
      <ul>
        <li>
          <strong>If you use Pocket for a business or profession</strong>, including as a
          startup or as an independent specialist, and to the extent the law allows: Pocket is
          not liable for indirect, incidental, special, consequential or punitive damages, or
          for lost profits, revenue or data; and Pocket&apos;s total liability for all claims
          relating to the Service is limited to the greater of the fees you paid Pocket in the
          12 months before the claim, or 500 US dollars.
        </li>
        <li>
          <strong>If you are a consumer</strong> under the law of your country of residence,
          Pocket is liable in accordance with that law, and the limits above apply only to the
          extent that law allows.
        </li>
        <li>
          Pocket is not responsible for the conduct of other users, or for the performance of
          the Stellar network, Circle, Trustless Work, Pollar or wallet providers, except to the
          extent a loss is caused by Pocket&apos;s own breach of these Terms.
        </li>
      </ul>

      <h2>17. Indemnity</h2>
      <p>
        If you use Pocket for a business or profession, you will indemnify Pocket against
        claims by third parties, and the reasonable costs of defending them, to the extent they
        result from your content, your breach of these Terms or your breach of the law. You will
        not have to indemnify Pocket for losses caused by Pocket&apos;s own breach, negligence
        or misconduct. Pocket will tell you promptly about any such claim and let you take part
        in its defence. This section does not apply to consumers, except as their local law
        allows.
      </p>

      <h2>18. Changes to these Terms</h2>
      <p>
        We may update these Terms to reflect changes in the Service, the law or how we operate.
        The version in force is shown at the top, with its date. We will give at least 15
        days&apos; notice, in the Service and by email where we have yours, before a new version
        takes effect, unless the change is required by law or urgently needed for security.
        Every new version must be accepted before you keep using the Service; if you do not
        accept it, you can close your account at no cost. Funded Engagements continue under the
        version in force when they were funded, unless the law requires otherwise.
      </p>

      <h2>19. Governing law and disputes with Pocket</h2>
      <p>
        If you have a problem with Pocket, write to us first at {LEGAL_EMAIL}. Most issues can
        be solved that way, and we will answer within 15 business days, or sooner if your law
        requires it.
      </p>
      <p>
        These Terms are governed by the laws of the country where Pocket&apos;s operating entity
        is incorporated, which we will state here once it exists. This does not take away the
        protection of the mandatory consumer and data protection laws of the country where you
        live. If you are a consumer, you may bring proceedings in the courts of your place of
        residence and file complaints with your consumer protection authority, and nothing in
        these Terms requires you to go to arbitration or to give up collective actions.
      </p>

      <h2>20. Users in the European Union, the United Kingdom and elsewhere</h2>
      <ul>
        <li>
          If you live in the European Union or the United Kingdom, you have the rights the
          consumer and data protection laws of your country give you, and these Terms do not
          limit them.
        </li>
        <li>
          Startups use Pocket as businesses. Specialists are independent professionals, and
          Pocket asks them to act as such. Consumer protection rules that apply between a
          business and a consumer may not apply to an Engagement between two businesses or
          professionals.
        </li>
        <li>
          Our single point of contact for users and for authorities, including under the
          European Union&apos;s Digital Services Act, is {LEGAL_EMAIL}, in English or Spanish.
        </li>
        <li>
          If you use Pocket for a business, you may ask us to review any decision to restrict,
          suspend or close your account, as described in section 12, and we will give you at
          least 15 days&apos; notice of changes to these Terms, as described in section 18.
        </li>
      </ul>

      <h2>21. General</h2>
      <ul>
        <li>
          <strong>Electronic contracting and notices.</strong> You agree to enter into these
          Terms electronically, and to receive notices in the Service and by email to the
          contact address you gave us. These satisfy any requirement that they be in writing.
          Notices to Pocket must be sent to {LEGAL_EMAIL}.
        </li>
        <li>
          <strong>Force majeure.</strong> Pocket is not liable for delays or failures caused by
          events beyond its reasonable control, including network outages, blockchain
          congestion or halts, actions of a stablecoin issuer, or acts of authorities.
        </li>
        <li>
          <strong>Survival.</strong> The sections on escrow, disputes, content licences, work
          product, liability, indemnity, governing law and this section continue after your
          account is closed.
        </li>
        <li>
          <strong>No third-party beneficiaries.</strong> These Terms create no rights for anyone
          other than you and Pocket.
        </li>
        <li>
          <strong>Feedback.</strong> If you send us suggestions, we may use them freely and
          without any obligation to you.
        </li>
        <li>
          <strong>Trademarks.</strong> The Pocket name and logo belong to Pocket; you may not
          use them without our permission.
        </li>
        <li>
          <strong>Authorities.</strong> Pocket may disclose information to authorities when the
          law requires it, and will tell affected users where the law allows.
        </li>
        <li>
          <strong>Whole agreement.</strong> These Terms, the Privacy Policy and any terms shown
          for a specific feature are the whole agreement between you and Pocket about the
          Service. If a provision is found invalid, the rest remains in force. Not enforcing a
          provision is not a waiver of it.
        </li>
        <li>
          <strong>Transfer.</strong> You may not transfer your rights under these Terms without
          our consent. We may transfer ours to the entity that operates Pocket, or as part of a
          merger or sale, and will tell you if we do.
        </li>
        <li>
          <strong>Language.</strong> These Terms are written in English. Where the law of your
          country requires a translation of consumer contracts, we will provide one, and it will
          prevail to the extent that law requires.
        </li>
      </ul>

      <h2>22. Contact</h2>
      <p>For anything about these Terms, write to {LEGAL_EMAIL}.</p>
    </LegalPage>
  );
}
