# OpenCode

Mognet uses the OpenCode setup on the connected environment. With a remote environment, its
OpenCode login and configuration apply, not the setup on your desktop machine.

Mognet requires OpenCode 1.14.19 or newer. It checks the server version before it loads models or
starts work. If the check fails, update OpenCode or fix the server URL and password, then refresh
the provider status. Reconnecting the client also runs the check again.

## Server authentication

Without a server URL, Mognet starts a local OpenCode server. The process inherits
`OPENCODE_SERVER_PASSWORD` from the environment. A password in the provider settings overrides
that environment value for both the local process and Mognet.

With a server URL, Mognet connects to that external server and uses only the password in the
provider settings. It does not send a local `OPENCODE_SERVER_PASSWORD` to an external server.
OpenCode uses this password for HTTP Basic authentication.

## Refresh the model list

Mognet loads the model list when an enabled OpenCode provider starts and keeps the list in its
cache. Reconnecting a client or using a refresh control asks OpenCode for the list again. The
periodic provider health setting does not refresh OpenCode's catalog.

After changing an OpenCode login or configuration outside Mognet, open **Settings > Providers**,
select the environment, and choose **Refresh provider status**. Changing the provider's
configuration in Mognet also replaces that provider connection.

OpenCode reads credential changes on each model-list request. Native OpenCode configuration files
can stay cached while the local helper is running. The helper closes after 30 seconds with no
model-list or text-generation work. Refresh after that idle period to start a new helper and read
the file changes. Repeated refreshes or active helper work can extend this wait.

Mognet does not own an external OpenCode server. Native configuration changes on that server can
require its own reload or restart before a refresh returns the new list.

If a refresh fails, Mognet keeps the last known models, slash commands, and skills. Fix the
connection, then refresh again. A successful refresh can remove entries that OpenCode no longer
offers.

## Continue an existing thread

An existing thread keeps its selected model and options when that model is temporarily absent
from the catalog. The web picker shows an **Unavailable** row and keeps saved option values visible
until the model metadata returns. Mognet does not switch the thread to the first model in the
list.

The stored selection does not guarantee that OpenCode can still run the model. If the provider
rejects it, select an available model before trying again.
