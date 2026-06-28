import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Simulations',
  tagline: 'Executable models, ODD protocols, and tutorials for real-world systems',
  favicon: 'img/favicon.ico',
  future: {v4: true},
  url: 'https://sims.autonateai.com',
  baseUrl: '/',
  organizationName: 'AutoNateAI',
  projectName: 'sim-lab',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  markdown: {mermaid: true},
  themes: ['@docusaurus/theme-mermaid'],
  i18n: {defaultLocale: 'en', locales: ['en']},
  presets: [
    ['classic', {
      docs: {
        path: 'simulations',
        routeBasePath: 'simulations',
        exclude: ['**/pdf/build/**'],
        sidebarPath: './sidebars.ts',
        editUrl: 'https://github.com/AutoNateAI/sim-lab/edit/main/',
        showLastUpdateAuthor: false,
        showLastUpdateTime: false,
      },
      blog: false,
      theme: {customCss: './src/css/custom.css'},
    } satisfies Preset.Options],
  ],
  themeConfig: {
    image: 'img/social-card.svg',
    colorMode: {defaultMode: 'dark', respectPrefersColorScheme: true},
    navbar: {
      title: 'Simulations',
      logo: {alt: 'Simulations mark', src: 'img/logo.svg'},
      items: [
        {type: 'docSidebar', sidebarId: 'simulationsSidebar', position: 'left', label: 'Library'},
        {to: '/simulations/workforce-development/city-opportunity-simulator', label: 'Run the first sim', position: 'left'},
        {href: 'https://github.com/AutoNateAI/sim-lab', label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {title: 'Library', items: [{label: 'All simulations', to: '/simulations'}]},
        {title: 'First model', items: [
          {label: 'Interactive simulation', to: '/simulations/workforce-development/city-opportunity-simulator'},
          {label: 'ODD protocol', to: '/simulations/workforce-development/city-opportunity-simulator/odd'},
          {label: 'Tutorial', to: '/simulations/workforce-development/city-opportunity-simulator/tutorial'},
        ]},
        {title: 'Source', items: [{label: 'GitHub', href: 'https://github.com/AutoNateAI/sim-lab'}]},
      ],
      copyright: `Copyright © ${new Date().getFullYear()} AutoNateAI. Built in public.`,
    },
    prism: {theme: prismThemes.github, darkTheme: prismThemes.dracula},
  } satisfies Preset.ThemeConfig,
};

export default config;
