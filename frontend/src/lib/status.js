/**
 * One colour per ERPNext status / workflow state, shared by every doctype.
 * Tones map to classes in components/StatusBadge.jsx.
 */
const TONES = {
  gray: ['Draft'],
  amber: ['Pending', 'Pending L1', 'Pending L2', 'Pending L3', 'Pending Approval', 'On Hold', 'Open', 'Replied', 'Expiring Soon', 'On Leave', 'Suspended', 'To Submit', 'Withheld', 'Self Appraisal', 'Manager Review', 'HR Review', 'To Acknowledge', 'Not Started', 'In Progress', 'New', 'In Kitchen', 'Booked', 'Occupied'],
  blue: [
    'Approved', 'To Deliver', 'To Receive', 'To Bill', 'To Deliver and Bill', 'To Receive and Bill',
    'Unpaid', 'Submitted', 'Unpaid and Discounted', 'Preparing', 'Confirmed', 'Seated', 'Reserved',
  ],
  purple: ['Partially Ordered', 'Partially Received', 'Partially Delivered', 'Partly Paid', 'Partly Paid and Discounted'],
  green: ['Completed', 'Ordered', 'Received', 'Paid', 'Delivered', 'Issued', 'Transferred', 'Active', 'Enabled', 'Valid', 'Present', 'Claimed', 'Acknowledged', 'Ready', 'Served', 'Billed', 'Available'],
  red: ['Hot', 'Rejected', 'Cancelled', 'Overdue', 'Overdue and Discounted', 'Lost', 'Expired', 'Stopped', 'Disabled', 'Expired', 'Absent', 'No Show'],
  slate: ['Closed', 'Return', 'Return Issued', 'Credit Note Issued', 'Debit Note Issued', 'Internal Transfer', 'Left', 'Inactive', 'No Expiry', 'Returned', 'Partly Claimed and Returned', 'Cleaning'],
}

const LOOKUP = Object.fromEntries(
  Object.entries(TONES).flatMap(([tone, list]) => list.map((s) => [s.toLowerCase(), tone])),
)

export function statusTone(status) {
  if (!status) return 'gray'
  const key = String(status).toLowerCase()
  if (LOOKUP[key]) return LOOKUP[key]
  if (key.startsWith('pending')) return 'amber'
  if (key.startsWith('partly') || key.startsWith('partially')) return 'purple'
  return 'gray'
}

const DOCSTATUS = { 0: 'Draft', 1: 'Submitted', 2: 'Cancelled' }

/** Status text for a record: ERPNext status, else Active/Disabled (masters), else docstatus. */
export function rowStatus(config, row) {
  if (config.statusFromDisabled) return Number(row.disabled) ? 'Disabled' : 'Active'
  if (row.status) return row.status
  if (row.docstatus != null) return DOCSTATUS[row.docstatus]
  return null
}
