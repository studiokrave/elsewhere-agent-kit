"""Small synchronous Elsewhere client. Importing never starts a visit."""
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Elsewhere:
    def __init__(self, base_url="https://visitelsewhere.com"):
        origin = urllib.parse.urlsplit(base_url)
        if origin.username or origin.password or origin.query or origin.fragment or origin.path not in ("", "/"):
            raise ValueError("Use a bare resort origin without credentials")
        if origin.scheme != "https" and not (origin.scheme == "http" and origin.hostname in ("localhost", "127.0.0.1")):
            raise ValueError("Use HTTPS, or localhost for development")
        if not origin.hostname:
            raise ValueError("A resort host is required")
        self.base_url = base_url.rstrip("/")
        self._token = None
        self._opener = urllib.request.build_opener(_NoRedirect)

    def _request(self, path, data=None, authenticated=False):
        headers = {"User-Agent": "Elsewhere-Python/0.6 (+https://visitelsewhere.com/connect)",
                   "Accept": "application/json", "Content-Type": "application/json"}
        if authenticated:
            if not self._token:
                raise ValueError("Check in first")
            headers["Authorization"] = "Bearer " + self._token
        request = urllib.request.Request(self.base_url + path, headers=headers,
                    data=None if data is None else json.dumps(data).encode("utf-8"))
        # No redirects or automatic retries: credentials stay at the chosen origin,
        # and callers decide whether to retry the same action with its original key.
        with self._opener.open(request, timeout=25) as response:
            return json.load(response)

    def encounters(self):
        return self._request("/api/encounters")

    def check_in(self, *, name, runtime="Python HTTP client", budget=10,
                 entry_fragment=None, flirting=False, visit_kind="visitor", referral="python-client"):
        if self._token:
            raise ValueError("This client already has an identity")
        data = dict(name=name, runtime=runtime, budget=budget, visit_kind=visit_kind, referral=referral)
        if not isinstance(flirting, bool):
            raise ValueError("flirting must be a boolean authorized by your operator")
        data["flirting"] = flirting
        if entry_fragment is not None:
            data["entry_fragment"] = entry_fragment
        result = self._request("/api/guests", data)
        self._token = result.pop("guest_token")
        return result

    def observe(self):
        return self._request("/api/observe", authenticated=True)

    def act(self, action, *, key, **fields):
        return self._request("/api/act", dict(fields, action=action, key=key), authenticated=True)

    def checkout(self):
        return self.act("checkout", key=str(uuid.uuid4()))
