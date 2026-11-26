/** The two sides of party payments: money in from customers, money out to suppliers. */
export const SIDES = {
  receive: {
    side: 'receive', partyType: 'Customer', plural: 'customers',
    list: '/receivable', act: '/receive', history: '/receivable-history',
    listTitle: 'Accounts receivable', listSub: 'Customers who owe you, with what is overdue and what they have paid',
    actVerb: 'Receive', actTitle: 'Receive payment', actSub: 'Record money received from a customer and settle their invoices',
    historyTitle: 'Receipt history', historySub: 'Payments received from customers',
    owed: 'Outstanding', owedLabel: 'To receive', mode: 'Received into', last: 'Last received',
  },
  pay: {
    side: 'pay', partyType: 'Supplier', plural: 'suppliers',
    list: '/payable', act: '/pay', history: '/payable-history',
    listTitle: 'Accounts payable', listSub: 'Suppliers you owe, with what is overdue and what you have paid',
    actVerb: 'Pay', actTitle: 'Make payment', actSub: 'Record money paid to a supplier and settle their bills',
    historyTitle: 'Payment history', historySub: 'Payments made to suppliers',
    owed: 'Outstanding', owedLabel: 'To pay', mode: 'Paid from', last: 'Last paid',
  },
}
