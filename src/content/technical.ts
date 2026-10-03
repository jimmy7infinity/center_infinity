/**
 * Employer-facing read for each visible project. Snippets are trimmed from the
 * product, not imported from it. A project with no entry has no control.
 */

export const TECHNICAL_LEAVES = [
  'abstract',
  'shape',
  'decisions',
  'boundaries',
] as const

export type TechnicalLeafId = (typeof TECHNICAL_LEAVES)[number]

export type TechnicalRead = {
  abstract: { what: string; why: string; how: string }
  shape: { code: string; note: string }
  decisions: { code: string; note: string }
  boundaries: { code: string; note: string }
}

export function technicalLeafLabel(id: TechnicalLeafId): string {
  switch (id) {
    case 'abstract':
      return 'Abstract'
    case 'shape':
      return 'Shape'
    case 'decisions':
      return 'Decisions'
    case 'boundaries':
      return 'Boundaries'
    default: {
      const exhaustive: never = id
      throw new Error(`Unhandled technical leaf: ${exhaustive}`)
    }
  }
}

const centerInfinity: TechnicalRead = {
  abstract: {
    what: 'One beat of DOM type is visible. A WebGL scene is printed as the e-ink behind it. Project stills sit in a colour screen docked beside the page.',
    why: 'A studio page that behaves like a document gets read and forgotten. Center Infinity exists so the page change, the scene, and the type are the system a client is hiring.',
    how: 'A refresh runs 440ms and the page swaps at 130ms, while the panel is blank. Reduced motion calls that swap immediately. Ending the flyer refreshes back to the cover.',
  },
  shape: {
    code: `const REFRESH_MS = 440
const SWAP_MS = 130

ink page      // DOM, one beat visible
scene         // R3F canvas, printed as e-ink
color screen  // docked still, above the panel`,
    note: 'The page swaps at 130ms, while the panel is blank.',
  },
  decisions: {
    code: `if (prefersReducedMotion()) {
  swap()
  return
}
runRefresh(swap)`,
    note: 'The refresh is the transition. Reduced motion still changes the page.',
  },
  boundaries: {
    code: `swap runs inside the flash, before the new page draws
color screen is a sibling of the scene, not a mesh in it
endRun() → refresh back to the cover`,
    note: 'The flyer is a mode. The page index stays the site.',
  },
}

const dispose: TechnicalRead = {
  abstract: {
    what: 'Guests commit frames to one roll through a join code. There is no guest account.',
    why: 'A phone roll publishes as it is shot, and a shared night turns into a performance for an infinite feed. Dispose exists so that night has a fixed frame count and a reveal the host controls, and the record stays scarce.',
    how: 'The browser PUTs the bytes to R2 on a signed URL. The server commits the shot only when the roll is open and the upload intent belongs to that guest session. Reveal is an album status, sealed_waiting until the host policy opens it.',
  },
  shape: {
    code: `type Roll = {
  shotLimit: number
  committedCount: number
  status: "open" | "full" | "sealed"
}

type RevealPolicy = { mode: "host_unlock" | "schedule" }

guest -- signed PUT --> R2
confirm(intent, session) --> Shot`,
    note: 'The server stores the roll. The bytes go to R2.',
  },
  decisions: {
    code: `getSignedUrl(PutObject, { expiresIn })
→ { method: "PUT", omitAuth: true }`,
    note: 'The browser writes the object. The app signs the URL, then confirms the upload against the guest session.',
  },
  boundaries: {
    code: `committedCount <= shotLimit
album.status == "revealed" || sealed
intent.guestSessionId == session.id`,
    note: 'A full roll and a hidden album are states in the store. The camera cannot talk past them.',
  },
}

const boost: TechnicalRead = {
  abstract: {
    what: 'A teammate runtime. The web room is a connector. Domain code takes no vendor SDK. Tools, memory, and models sit behind ports.',
    why: 'A chat window on one model can talk, and it cannot be trusted with a side effect. Boost exists so a team can hand work to a runtime that remembers, calls tools, and stops when an action would leave the room.',
    how: 'A tool at riskLevel "external" calls ApprovalGate.request and stays pending until resolve(). Skills such as hireLoop stay tools in that room. Models sit behind one port: Gemini, then Kimi, then Groq.',
  },
  shape: {
    code: `apps/runtime → application → domain
domain → no vendor SDK
connectors → ports

type ApprovalRequest = {
  toolName: string
  riskLevel: ToolRiskLevel
  status: "pending" | "approved" | "rejected"
}`,
    note: 'The web room is a connector. The product is the runtime.',
  },
  decisions: {
    code: `needsApproval = gate && tool.riskLevel == "external"

gate.request({
  toolName, riskLevel: "external", payload,
}) // status starts "pending"`,
    note: 'An external tool parks on the gate. The turn waits for resolve().',
  },
  boundaries: {
    code: `resolve() only while status == "pending"
official MCP endpoints, or an explicit allowlist
hireloop.* is a tool in the room`,
    note: 'A side effect that leaves the room is a record with a status, not a direct call.',
  },
}

const studioEternity: TechnicalRead = {
  abstract: {
    what: 'An operator console for local image, video, and audio. The operator names a capability. The platform resolves it to a backend, models, a provider, a pipeline, and a preset.',
    why: 'A node graph makes the graph the product. Studio Eternity exists so the operator asks for upscale, generate, or edit, while the queue, the catalog, and the job stay with the platform.',
    how: 'enqueue_job materializes that pipeline and freezes a binding_snapshot on the job. A worker claims it with a lease. ComfyUI and SeedVR2 implement backends. The job keeps the binding it was given.',
  },
  shape: {
    code: `class CapabilityBinding(BaseModel):
    capability_id: str
    backend_id: str
    provider_id: str
    pipeline_id: str
    preset_id: str

class Job(BaseModel):
    status: JobStatus
    pipeline_snapshot: PipelineDocument
    binding_snapshot: CatalogBindingSnapshot | None`,
    note: 'The console asks for a capability. The job stores the binding it was given.',
  },
  decisions: {
    code: `def enqueue_job(..., capability_id: str | None = None) -> Job:
    resolved = materialize_catalog_job_pipeline(capability_id)
    job = Job(status=JobStatus.QUEUED,
              binding_snapshot=resolved.binding_snapshot)
    queue.enqueue(job.id)`,
    note: 'Resolution is Capability, then Backend, Model, Provider, Pipeline, Preset. The worker runs the snapshot taken at enqueue.',
  },
  boundaries: {
    code: `class JobQueue(Protocol):
    def claim(self, worker_id: str, lease_seconds: int) -> Job | None: ...
    def heartbeat(self, job_id: str, worker_id: str) -> None: ...

asset.project_id == job.project_id`,
    note: 'The backend does not own the queue. A job keeps the binding it was enqueued with.',
  },
}

const lookingLocal: TechnicalRead = {
  abstract: {
    what: 'A catalog of stays on Koh Phangan. Next.js is the guide. FastAPI holds properties, availability, and bookings. Images are Cloudinary URLs. Payments are a second service.',
    why: 'A guide that only describes the island sends the money elsewhere. LookingLocal exists so a stay can be requested, confirmed, and paid against inventory a host actually operates.',
    how: 'Pending requests may overlap. A confirmed booking owns the dates. After a manager approves, the API sends a payment link. Paid is set from a Stripe event that passes construct_event.',
  },
  shape: {
    code: `class PropertyDocument(BaseDocument):
    location: LocationInfo          # country, city, area
    pricing: PriceStructure
    availability_calendar: AvailabilityCalendar
    main_image_url: str             # Cloudinary

class BookingDocument(BaseDocument):
    status: str                     # pending → confirmed
    payment_status: PaymentStatus`,
    note: 'The Next.js guide reads a FastAPI catalog. Payments are a second service.',
  },
  decisions: {
    code: `# only a confirmed booking blocks the dates
find({
  "property_id": property_id,
  "status": "confirmed",
  "start_date": {"$lte": end},
  "end_date": {"$gte": start},
})`,
    note: 'Several requests can overlap. One confirmation owns the dates.',
  },
  boundaries: {
    code: `stripe.Webhook.construct_event(payload, sig, secret)

booking.status in {
  pending, confirmed, current,
  rejected, cancelled, completed,
}
send_payment_request_email(...)  # after a manager approves`,
    note: 'Paid comes from a signed Stripe event. The payment link goes out after approval.',
  },
}

export const technicalByName: { [name: string]: TechnicalRead | undefined } = {
  'Center Infinity': centerInfinity,
  Dispose: dispose,
  Boost: boost,
  'Studio Eternity': studioEternity,
  LookingLocal: lookingLocal,
}
