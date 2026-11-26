/**
 * Which point-of-sale screens this app offers: 'both' (a switch at the top), 'normal' (counter till)
 * or 'restaurant' (card menu with tables, dine-in, takeaway, delivery and bookings).
 * The Operator rewrites this line when you choose a style for the generated app.
 */
export const POS_STYLE = 'normal'

/**
 * Restaurant parts this app includes. The Operator rewrites the line below; a part that is left out
 * disappears from the screens (and its doctypes and menu entries are not generated).
 */
export const RESTAURANT = { bookings: false, kitchenStations: false, kitchenDisplay: false, waiter: false, tokens: false }
