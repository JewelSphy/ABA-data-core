# Why Logic Is Mostly in HTML/JS Right Now

This project uses a static frontend, so browser-side interaction logic lives in HTML/JS files.

- Frontend (`frontend/*.html` + inline JS):
  - Handles button clicks, tabs, form state, rendering, and UX behavior.
- Backend (`backend/gilberto/**/*.java`):
  - Handles API routes, MySQL reads/writes, and server-side business logic.

Browsers cannot run Java classes directly, so UI behavior must still be handled in JS.  
Java runs on the server and is called from the frontend using HTTP requests.

## Current Split in This App

- **Frontend**
  - Calls backend endpoints.
  - Displays data.
  - Collects form input.
- **Java backend**
  - Validates input.
  - Executes SQL against MySQL.
  - Returns JSON responses.
  - Generates AI-style session note text via `/api/ai/session-note`.

## `AiNoteHandler.java` Line-by-Line (Simple)

```java
package gilberto.handlers;
```
- Puts this class in the `gilberto.handlers` package.

```java
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import gilberto.HttpUtil;
import gilberto.JsonUtil;
import java.io.IOException;
```
- Imports the tools needed to receive HTTP requests, send responses, and parse JSON safely.

```java
public final class AiNoteHandler implements HttpHandler {
```
- Declares a request handler class for the AI note endpoint.

```java
@Override
public void handle ( HttpExchange ex ) throws IOException {
```
- Main method that runs each time this endpoint is called.

```java
if ( HttpUtil.preflight ( ex ) ) return;
```
- Handles browser CORS preflight requests and exits early.

```java
if ( !"POST".equalsIgnoreCase ( ex.getRequestMethod () ) ) {
  HttpUtil.err ( ex, 405, "Method not allowed" );
  return;
}
```
- Only allows `POST`. Any other method returns HTTP 405.

```java
String b = HttpUtil.body ( ex );
```
- Reads raw request body text (JSON payload).

```java
String client = safe ( JsonUtil.field ( b, "client_name" ), "the client" );
...
```
- Reads each field from JSON and applies fallback defaults if missing.

```java
String note = "...";
```
- Builds a full progress-note paragraph using incoming session fields.

```java
HttpUtil.json ( ex, 200, "{\"note\":" + JsonUtil.strOrNull ( note ) + "}" );
```
- Sends JSON response back to frontend: `{ "note": "..." }`.

```java
private String safe ( String v, String fallback ) {
  return JsonUtil.blank ( v ) ? fallback : v;
}
```
- Helper function: if value is blank, use fallback text.

## If You Want More Logic in Java

Next step is moving submit/signature validation to backend endpoints, so the frontend becomes mostly display and API calls.
