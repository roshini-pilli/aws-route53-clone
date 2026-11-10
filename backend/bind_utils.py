
import shlex


SUPPORTED_RECORD_TYPES = {
    "A",
    "AAAA",
    "CNAME",
    "TXT",
    "MX",
    "NS",
    "PTR",
    "SRV",
    "CAA"
}


def generate_bind_file(zone):
    zone_name = zone.name.rstrip(".")
    lines = [
        f"$ORIGIN {zone_name}.",
        "$TTL 300",
        "",
        f"@ IN SOA ns1.{zone_name}. admin.{zone_name}. (",
        "    2026111001",
        "    3600",
        "    900",
        "    604800",
        "    86400",
        ")",
        "",
        f"@ IN NS ns1.{zone_name}.",
        f"@ IN NS ns2.{zone_name}.",
        ""
    ]

    for record in zone.records:
        name = record.name.strip().rstrip(".")
        value = record.value.strip()

        if name == "@" or name == zone_name:
            name = "@"
        elif name.endswith("." + zone_name):
            name = name[:-(len(zone_name) + 1)]

        if record.record_type == "TXT":
            escaped_value = value.replace("\\", "\\\\").replace('"', '\\"')
            value = f'"{escaped_value}"'

        lines.append(
            f"{name} {record.ttl} IN {record.record_type} {value}"
        )

    return "\n".join(lines) + "\n"


def parse_bind_file(content, zone_name):
    origin = zone_name.rstrip(".") + "."
    default_ttl = 300
    records = []
    skipped = 0
    logical_lines = []
    current_line = ""
    parenthesis_depth = 0

    for raw_line in content.splitlines():
        stripped = raw_line.strip()

        if not stripped:
            continue

        current_line += " " + stripped
        parenthesis_depth += stripped.count("(") - stripped.count(")")

        if parenthesis_depth > 0:
            continue

        logical_lines.append(current_line.strip())
        current_line = ""

    if current_line:
        logical_lines.append(current_line.strip())

    for line in logical_lines:
        if line.startswith("$ORIGIN"):
            parts = line.split(maxsplit=1)
            if len(parts) == 2:
                origin = parts[1].rstrip(".") + "."
            continue

        if line.startswith("$TTL"):
            parts = line.split(maxsplit=1)
            if len(parts) == 2:
                try:
                    default_ttl = int(parts[1])
                except ValueError:
                    raise ValueError("Invalid $TTL value")
            continue

        try:
            lexer = shlex.shlex(line, posix=True)
            lexer.whitespace_split = True
            lexer.commenters = ";"
            tokens = list(lexer)
        except ValueError:
            skipped += 1
            continue

        if not tokens:
            continue

        if tokens[0].startswith("$"):
            skipped += 1
            continue

        owner = tokens.pop(0)
        ttl = default_ttl

        if not tokens:
            skipped += 1
            continue

        if tokens[0].isdigit():
            ttl = int(tokens.pop(0))

        if tokens and tokens[0].upper() in {"IN", "CH", "HS"}:
            record_class = tokens.pop(0).upper()
            if record_class != "IN":
                skipped += 1
                continue

        if not tokens:
            skipped += 1
            continue

        record_type = tokens.pop(0).upper()

        if record_type == "SOA":
            skipped += 1
            continue

        if record_type not in SUPPORTED_RECORD_TYPES:
            skipped += 1
            continue

        if not tokens:
            skipped += 1
            continue

        value = " ".join(tokens).strip()

        if record_type == "TXT":
            value = value.strip()

        if owner == "@":
            record_name = "@"
        elif owner.endswith("."):
            record_name = owner.rstrip(".")
        else:
            record_name = owner.rstrip(".") + "." + origin.rstrip(".")

        records.append({
            "name": record_name,
            "record_type": record_type,
            "value": value,
            "ttl": ttl
        })

    return {
        "records": records,
        "skipped": skipped
    }
