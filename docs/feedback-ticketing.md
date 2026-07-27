# Feedback and Tickets

Every authenticated Theta-Space account, including administrators, submits **Feedback** from the floating button. The compact form appears above the current page without changing that page's layout or URL. Only administrators see the resulting shared **Tickets** under **Admin > Settings > Tickets**.

## Ticket list

- Search by ticket number, subject, description, member name, username, email, message text, Internal Note text, or source URL.
- Feedback Type and ticket status are separate filters. **All** under Feedback Type does not override the selected status filter.
- Assigned rows have a restrained highlight. A stronger blue highlight means the ticket is assigned to you.
- **Open** shows how long the ticket has been active. For resolved tickets it shows total time to resolution.
- **Latest** is the most recent ticket change or message. **Unread** indicates activity you have not opened.
- Filters, sorting, and the open ticket number stay in the page URL, so closing a ticket returns to the same list.

## Assignment

- Select one or more rows, then choose **Assign to Me** to take ownership.
- Choose an administrator and **Route** to assign selected tickets to someone else.
- Inside a ticket, use **Assigned Administrator**, **Update Assignment**, or **Assign to Me**.
- The Assigned column shows the current owner. Assignment controls notifications, but every authorized administrator can still see the ticket.
- If another administrator changed the ticket first, refresh and review the newer state before trying again.

## Ticket thread and messages

- Each ticket has an administrator-only thread.
- **Message User** records the message in the ticket thread and delivers the same text as a normal Comm Center message from the administrator.
- **Internal Note** is visible only to authorized administrators. It is never sent to the submitting user or exposed through member APIs.
- The composer starts in **Internal Note** mode for each ticket. Its gold border and label distinguish it from a Comm Center message.
- Failed sends can be retried without creating duplicate ticket or Comm Center messages.

## Resolution

- Add an optional resolution summary and optional final Comm Center message, then choose **Mark Resolved**.
- Resolution records the administrator and time while preserving the full conversation.
- Use **Reopen Ticket** when additional ticket work is needed.
- Previously resolved tickets remain available through the **Resolved** or **All Statuses** filters.

## Screenshots and page context

- Screenshots open through protected Theta-Space media access and are available only to authorized administrators after submission.
- The source URL opens the exact Theta-Space location captured when the member opened Feedback.
- **Browser and recent activity** contains limited diagnostics: route changes, clicked control labels, viewport, device class, browser, operating system, and build version when available.
- The activity log never records field values, passwords, cookies, authorization data, or message contents.
- Treat screenshots as potentially sensitive member content. View them only for ticket diagnosis and do not redistribute them.
