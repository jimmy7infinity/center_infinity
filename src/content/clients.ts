/**
 * Client work, shown together on one page. Less than a project dossier:
 * a name, one line, a still, and a mark. `reserved` is named work that is
 * not ready to show. `open` is an empty frame.
 */
export type ClientWork =
  | {
      kind: 'live'
      name: string
      line: string
      href: string
      image: string
      imageAlt: string
      logo: string
      logoAlt: string
    }
  | {
      kind: 'reserved'
      name: string
      line: string
    }
  | {
      kind: 'open'
    }

export const clients: readonly ClientWork[] = [
  {
    kind: 'live',
    name: 'Specter CK & Partners',
    line: 'The public home of a Bangkok litigation firm.',
    href: 'https://specterdemo.up.railway.app/?utm_source=centerinfinity',
    image: '/projects/specter-home.jpg',
    imageAlt: 'Specter CK & Partners homepage, a blue skyline over the Bangkok river',
    logo: '/clients/specter-logo.png',
    logoAlt: 'Specter CK & Partners',
  },
  {
    kind: 'live',
    name: 'Wiktoria Lewandowska',
    line: 'A portfolio for a marketing and media specialist.',
    href: 'https://wlewandowska.up.railway.app/?utm_source=centerinfinity',
    image: '/projects/wiktoria-home.jpg',
    imageAlt: 'Wiktoria Lewandowska’s portfolio, a portrait on a pale green page',
    logo: '/clients/wiktoria-logo.png',
    logoAlt: 'Wiktoria Lewandowska',
  },
  {
    kind: 'reserved',
    name: 'All Flow Fishing',
    line: 'On the bench.',
  },
  {
    kind: 'open',
  },
]
