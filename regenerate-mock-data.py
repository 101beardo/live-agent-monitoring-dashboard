import json, random, datetime as dt

random.seed(20260910)

FIRST = ["Aarav","Diya","Rohan","Meera","Kabir","Ananya","Vikram","Sneha","Arjun","Ishita",
         "Nikhil","Priya","Rahul","Tanvi","Karan","Neha","Aditya","Riya","Manav","Pooja",
         "Siddharth","Kavya","Varun","Anjali","Harsh","Divya","Rajat","Shreya","Amit","Nisha",
         "James","Sophie","Liam","Olivia","Daniel","Emma","Owen","Chloe","Ethan","Grace",
         "Marcus","Leah","Oscar","Ruby","Felix","Iris","Hugo","Nora","Theo","Maya"]
LAST = ["Sharma","Patel","Reddy","Nair","Iyer","Kulkarni","Mehta","Desai","Bose","Chauhan",
        "Rao","Menon","Gupta","Joshi","Malhotra","Verma","Pillai","Shetty","Banerjee","Kapoor",
        "Whitfield","Okonkwo","Brennan","Novak","Dias","Kaminski","Hartley","Osei","Lindqvist","Moreau"]

QUEUES = ["Billing", "Technical Support", "Sales", "Retentions", "Complaints", "Onboarding"]
SITES = ["Bangalore", "Manchester", "London"]
TEAMS = ["Team Alpha", "Team Bravo", "Team Charlie", "Team Delta"]

DEVICE_STATES = ["Registered", "Unregistered", "Ringing", "Answered", "OnHold", "CallEnded"]
AGENT_STATES = ["Available", "OnBreak", "AfterCallWork", "LoggedOut"]
BREAK_REASONS = ["Lunch", "Short break", "Training", "Coaching", "Admin"]
HANGUP_CAUSES = ["normal_clearing", "caller_abandoned", "agent_hangup", "transfer", "network_failure"]

N_AGENTS = 300
BASE = dt.datetime(2026, 9, 9, 9, 0, 0, tzinfo=dt.timezone.utc)


def iso(t):
    return t.isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------- agents
used = set()
agents = []
for i in range(N_AGENTS):
    while True:
        name = f"{random.choice(FIRST)} {random.choice(LAST)}"
        if name not in used:
            used.add(name)
            break
    agent_id = f"AG-{1000 + i}"
    agents.append({
        "agentId": agent_id,
        "name": name,
        "extension": str(2000 + i),
        "email": name.lower().replace(" ", ".") + "@example-cx.com",
        "queues": random.sample(QUEUES, k=random.choice([1, 1, 2, 2, 3])),
        "team": random.choice(TEAMS),
        "site": random.choice(SITES),
        "shiftStart": random.choice(["06:00", "09:00", "13:00", "18:00"]),
        # snapshot state at the moment this roster was fetched
        "deviceStatus": None,
        "agentStatus": None,
        "currentCallId": None,
        "callStartedAt": None,
        "statusChangedAt": None,
        "snapshotSeq": 0,
    })

# ------------------------------------------------------- event generation
events = []          # logical (true) order
calls = []
eid = 0
call_no = 0


def new_event(agent, kind, status, ts, seq, **extra):
    global eid
    eid += 1
    e = {
        "eventId": f"EVT-{eid:06d}",
        "agentId": agent["agentId"],
        "stream": kind,                 # "device" | "agent"
        "status": status,
        "sequence": seq,                # per-agent monotonic counter
        "emittedAt": iso(ts),
    }
    e.update(extra)
    return e


# agents whose device clock is skewed -> timestamp-only ordering will be wrong
skewed = set(random.sample([a["agentId"] for a in agents], k=18))
skew_amount = {aid: random.choice([-45, -30, 25, 40, 70]) for aid in skewed}

# agents that stop emitting device events partway (stuck / silent devices)
goes_silent = set(random.sample([a["agentId"] for a in agents], k=12))

for agent in agents:
    aid = agent["agentId"]
    seq = 0
    t = BASE + dt.timedelta(seconds=random.randint(0, 240))

    def bump(lo=3, hi=45):
        return dt.timedelta(seconds=random.randint(lo, hi))

    # login
    seq += 1
    events.append(new_event(agent, "device", "Registered", t, seq))
    t += bump(2, 15)
    seq += 1
    events.append(new_event(agent, "agent", "Available", t, seq))

    n_calls = random.randint(2, 9)
    silent_after = random.randint(1, max(1, n_calls - 1)) if aid in goes_silent else None

    for c in range(n_calls):
        if silent_after is not None and c >= silent_after:
            break

        t += bump(10, 120)
        call_no += 1
        call_id = f"CALL-{call_no:06d}"
        queue = random.choice(agent["queues"])
        started = t

        seq += 1
        events.append(new_event(agent, "device", "Ringing", t, seq,
                                callId=call_id, queue=queue,
                                callerNumber="+44" + str(random.randint(7000000000, 7999999999)),
                                direction=random.choice(["inbound", "inbound", "inbound", "outbound"])))

        # ~8% of calls are abandoned before answer
        if random.random() < 0.08:
            t += bump(4, 25)
            seq += 1
            events.append(new_event(agent, "device", "CallEnded", t, seq,
                                    callId=call_id, hangupCause="caller_abandoned",
                                    talkTimeSeconds=0))
            calls.append({
                "callId": call_id, "agentId": aid, "queue": queue,
                "startedAt": iso(started), "endedAt": iso(t),
                "talkTimeSeconds": 0, "holdTimeSeconds": 0,
                "hangupCause": "caller_abandoned", "answered": False,
                "direction": "inbound", "disposition": "Abandoned",
            })
            continue

        t += bump(3, 20)
        answered_at = t
        seq += 1
        events.append(new_event(agent, "device", "Answered", t, seq,
                                callId=call_id, queue=queue))

        hold_total = 0
        for _ in range(random.choice([0, 0, 0, 1, 1, 2])):
            t += bump(15, 120)
            seq += 1
            events.append(new_event(agent, "device", "OnHold", t, seq, callId=call_id))
            held = random.randint(10, 90)
            hold_total += held
            t += dt.timedelta(seconds=held)
            seq += 1
            events.append(new_event(agent, "device", "Answered", t, seq,
                                    callId=call_id, resumedFromHold=True))

        t += bump(20, 400)
        talk = int((t - answered_at).total_seconds()) - hold_total
        cause = random.choice([c for c in HANGUP_CAUSES if c != "caller_abandoned"])
        seq += 1
        events.append(new_event(agent, "device", "CallEnded", t, seq,
                                callId=call_id, hangupCause=cause,
                                talkTimeSeconds=max(talk, 1)))
        calls.append({
            "callId": call_id, "agentId": aid, "queue": queue,
            "startedAt": iso(started), "endedAt": iso(t),
            "talkTimeSeconds": max(talk, 1), "holdTimeSeconds": hold_total,
            "hangupCause": cause, "answered": True,
            "direction": "inbound", "disposition": random.choice(
                ["Resolved", "Escalated", "Follow-up required", "Transferred", "Callback booked"]),
        })

        # after-call work, then back to available or a break
        t += bump(1, 6)
        seq += 1
        events.append(new_event(agent, "agent", "AfterCallWork", t, seq))
        t += bump(10, 180)
        seq += 1
        if random.random() < 0.22:
            events.append(new_event(agent, "agent", "OnBreak", t, seq,
                                    reason=random.choice(BREAK_REASONS)))
            t += bump(120, 900)
            seq += 1
            events.append(new_event(agent, "agent", "Available", t, seq))
        else:
            events.append(new_event(agent, "agent", "Available", t, seq))

    # some agents log out at the end
    if random.random() < 0.30:
        t += bump(30, 300)
        seq += 1
        events.append(new_event(agent, "agent", "LoggedOut", t, seq))
        t += bump(1, 10)
        seq += 1
        events.append(new_event(agent, "device", "Unregistered", t, seq))

# apply clock skew to the emittedAt of skewed agents (sequence stays truthful)
for e in events:
    if e["agentId"] in skewed:
        ts = dt.datetime.fromisoformat(e["emittedAt"].replace("Z", "+00:00"))
        ts += dt.timedelta(seconds=skew_amount[e["agentId"]])
        e["emittedAt"] = iso(ts)

# ------------------------------------------------- snapshot / replay split
events.sort(key=lambda e: (e["emittedAt"], e["eventId"]))

# The roster snapshot is taken partway through the timeline. Events before the
# snapshot are stale and must be discarded by the candidate's reconciliation.
split = int(len(events) * 0.25)
snapshot_events, stream_events = events[:split], events[split:]

state = {}
for e in snapshot_events:
    s = state.setdefault(e["agentId"], {})
    if e["stream"] == "device":
        s["deviceStatus"] = e["status"]
        s["currentCallId"] = e.get("callId") if e["status"] in ("Ringing", "Answered", "OnHold") else None
        if e["status"] == "Ringing":
            s["callStartedAt"] = e["emittedAt"]
        if e["status"] == "CallEnded":
            s["callStartedAt"] = None
    else:
        s["agentStatus"] = e["status"]
    s["statusChangedAt"] = e["emittedAt"]
    s["snapshotSeq"] = e["sequence"]

for a in agents:
    s = state.get(a["agentId"], {})
    a["deviceStatus"] = s.get("deviceStatus", "Unregistered")
    a["agentStatus"] = s.get("agentStatus", "LoggedOut")
    a["currentCallId"] = s.get("currentCallId")
    a["callStartedAt"] = s.get("callStartedAt")
    a["statusChangedAt"] = s.get("statusChangedAt", iso(BASE))
    a["snapshotSeq"] = s.get("snapshotSeq", 0)

SNAPSHOT_AT = stream_events[0]["emittedAt"]

# ------------------------------------------------ scramble delivery order
delivered = []
i = 0
n = len(stream_events)
while i < n:
    # take a small window and shuffle within it -> local out-of-order delivery
    w = random.choice([1, 1, 1, 2, 2, 3, 4, 6])
    window = stream_events[i:i + w]
    random.shuffle(window)
    delivered.extend(window)
    i += w

# duplicates (~6%), inserted at a random later position
for e in random.sample(delivered, k=int(len(delivered) * 0.06)):
    pos = delivered.index(e)
    delivered.insert(min(pos + random.randint(1, 40), len(delivered)), dict(e))

# a handful of badly delayed events: yanked far forward in the stream
for e in random.sample(delivered, k=40):
    delivered.remove(e)
    delivered.insert(min(delivered.index(random.choice(delivered)) + random.randint(60, 400),
                         len(delivered)), e)

# late arrivals from *before* the snapshot: these are stale relative to
# agents.json and must be discarded, not applied
for e in random.sample(snapshot_events, k=60):
    delivered.insert(random.randint(0, len(delivered) - 1), dict(e))

# stamp delivery order and receivedAt (wall-clock arrival, differs from emittedAt)
for idx, e in enumerate(delivered):
    e["deliveryIndex"] = idx

out_dir = "/home/claude/takehome/mock/"

with open(out_dir + "agents.json", "w") as f:
    json.dump({
        "snapshotTakenAt": SNAPSHOT_AT,
        "totalAgents": len(agents),
        "agents": agents,
    }, f, indent=2)

with open(out_dir + "events.json", "w") as f:
    json.dump(delivered, f, indent=2)

calls.sort(key=lambda c: c["startedAt"], reverse=True)
with open(out_dir + "calls.json", "w") as f:
    json.dump({"totalCalls": len(calls), "calls": calls}, f, indent=2)

print("agents:", len(agents))
print("calls:", len(calls))
print("stream events delivered:", len(delivered))
print("unique events in stream:", len({e['eventId'] for e in delivered}))
print("duplicates:", len(delivered) - len({e['eventId'] for e in delivered}))
print("snapshot at:", SNAPSHOT_AT)
print("skewed-clock agents:", len(skewed))
print("silent-device agents:", len(goes_silent))
