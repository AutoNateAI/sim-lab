import Link from '@docusaurus/Link';
import type React from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

export default function Home(): React.JSX.Element {
  return (
    <Layout title="Executable models" description="An open library of simulations, ODD protocols, code, and tutorials.">
      <main>
        <section className={styles.hero}>
          <div className={styles.eyebrow}>OPEN SIMULATION LIBRARY</div>
          <Heading as="h1">Learn systems by running them.</Heading>
          <p>Explore executable models of cities, workforce programs, markets, and organizations—then inspect the assumptions and code behind every result.</p>
          <div className={styles.actions}>
            <Link className="button button--primary button--lg" to="/simulations/workforce-development/city-opportunity-simulator">Run the first simulation</Link>
            <Link className="button button--secondary button--lg" to="/simulations">Browse the library</Link>
          </div>
        </section>
        <section className={styles.grid}>
          <article><span>01</span><Heading as="h2">Run</Heading><p>Change budgets, outreach, training capacity, and employer demand. See the system respond immediately.</p></article>
          <article><span>02</span><Heading as="h2">Inspect</Heading><p>Read the ODD protocol and code notes. Every behavior and assumption stays visible.</p></article>
          <article><span>03</span><Heading as="h2">Build</Heading><p>Follow the tutorial, capture evidence in the real browser, and extend the model for your next project.</p></article>
        </section>
      </main>
    </Layout>
  );
}
