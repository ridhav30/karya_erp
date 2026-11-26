/** A blank restaurant order on screen. */
export const emptyDraft = (extra = {}) => ({ id: null, status: null, order_type: 'Dine In', table: '', guests: '', customer_name: '', phone: '', remarks: '', lines: [], ...extra })
