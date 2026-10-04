import { ArrowIcon } from './icons'
import { clients, type ClientWork } from '../content/clients'

function numeral(index: number) {
  return String(index + 1).padStart(2, '0')
}

function LivePrint({
  client,
  index,
}: {
  client: Extract<ClientWork, { kind: 'live' }>
  index: number
}) {
  return (
    <a
      className="print"
      href={client.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="print__frame">
        <img src={client.image} alt={client.imageAlt} />
      </span>
      <span className="print__caption">
        <img className="print__logo" src={client.logo} alt="" />
        <span className="print__meta">
          <span className="print__kicker">
            <span className="print__id">{numeral(index)}</span>
            <span className="print__name">{client.name}</span>
          </span>
          <span className="print__line">{client.line}</span>
        </span>
        <span className="print__go">
          Visit
          <ArrowIcon className="h-3.5 w-3.5" />
        </span>
      </span>
    </a>
  )
}

function ReservedPrint({
  client,
  index,
}: {
  client: Extract<ClientWork, { kind: 'reserved' }>
  index: number
}) {
  return (
    <article className="print print--reserved">
      <span className="print__frame print__frame--blank">
        <span className="print__standin">{client.name}</span>
      </span>
      <span className="print__caption">
        <span className="print__meta">
          <span className="print__kicker">
            <span className="print__id">{numeral(index)}</span>
            <span className="print__name">{client.name}</span>
          </span>
          <span className="print__line">{client.line}</span>
        </span>
      </span>
    </article>
  )
}

function OpenFrame({ index }: { index: number }) {
  return (
    <div className="print print--open">
      <span className="print__corner print__corner--nw" />
      <span className="print__corner print__corner--ne" />
      <span className="print__corner print__corner--sw" />
      <span className="print__corner print__corner--se" />
      <span className="print__open-index">{numeral(index)}</span>
    </div>
  )
}

function ClientFrame({ client, index }: { client: ClientWork; index: number }) {
  switch (client.kind) {
    case 'live':
      return <LivePrint client={client} index={index} />
    case 'reserved':
      return <ReservedPrint client={client} index={index} />
    case 'open':
      return <OpenFrame index={index} />
    default: {
      const exhaustive: never = client
      throw new Error(`Unhandled client work: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/** Four client frames on one sheet. Not a project dossier. */
export function ClientSheet() {
  return (
    <div className="client-sheet">
      <div>
        <p className="ink-label mb-6">Clients</p>
        <h2 className="ink-title max-w-xl">Work we built for other people.</h2>
      </div>
      <ol className="client-sheet__grid">
        {clients.map((client, index) => (
          <li
            key={client.kind === 'open' ? 'open' : client.name}
            aria-label={client.kind === 'open' ? 'Open slot' : undefined}
          >
            <ClientFrame client={client} index={index} />
          </li>
        ))}
      </ol>
    </div>
  )
}
