#!/usr/bin/env python3

import getpass
import re
import sys
import time
from pathlib import Path

import scratchattach as sa
from colorama import Fore, Style, init

init(autoreset=True)

VERSION = "1.1.0"
STUDIO_FILE = Path(__file__).with_name("studios.txt")

RETRY_DELAY = 5
REQUEST_DELAY = 1.5


def info(message):
    print(Fore.CYAN + "[INFO] " + Style.RESET_ALL + message)


def success(message):
    print(Fore.GREEN + "[SUCCESS] " + Style.RESET_ALL + message)


def warning(message):
    print(Fore.YELLOW + "[WARN] " + Style.RESET_ALL + message)


def error(message):
    print(Fore.RED + "[ERROR] " + Style.RESET_ALL + message)


def extract_studio_id(line):
    """
    Accept:

        123456
        https://scratch.mit.edu/studios/123456/
        https://scratch.mit.edu/studios/123456

    Returns the studio ID or None.
    """

    line = line.strip()

    if not line or line.startswith("#"):
        return None

    # Plain ID
    if line.isdigit():
        return line

    # Scratch studio URL
    match = re.search(
        r"scratch\.mit\.edu/studios/(\d+)",
        line,
        re.IGNORECASE
    )

    if match:
        return match.group(1)

    return None


def load_studios():
    if not STUDIO_FILE.exists():
        error(f"Could not find {STUDIO_FILE.name}")
        error("Create studios.txt next to scrapularizer.py.")
        sys.exit(1)

    studios = []
    invalid = 0

    for line_number, line in enumerate(
        STUDIO_FILE.read_text(encoding="utf-8").splitlines(),
        start=1
    ):
        studio_id = extract_studio_id(line)

        if studio_id is None:
            if line.strip() and not line.strip().startswith("#"):
                warning(
                    f"Ignoring invalid line {line_number}: "
                    f"{line.strip()}"
                )
                invalid += 1

            continue

        if studio_id not in studios:
            studios.append(studio_id)

    return studios, invalid


def main():
    print(Fore.MAGENTA + f"Scrapularizer v{VERSION}")
    print(Fore.MAGENTA + "=" * 30)
    print(
        Fore.YELLOW
        + "DO NOT USE SCRAPULARIZER FOR ABUSE!"
    )
    print(Fore.MAGENTA + "=" * 30)
    print()

    if len(sys.argv) != 2:
        error("Usage: python scrapularizer.py <project_id>")
        print(
            Fore.YELLOW
            + "Example: python scrapularizer.py 1388000745"
        )
        sys.exit(1)

    project_id = sys.argv[1]

    if not project_id.isdigit():
        error("Project ID must contain only numbers.")
        sys.exit(1)

    studios, invalid = load_studios()

    if not studios:
        error("No valid studio IDs were found.")
        sys.exit(1)

    print(f">> Target Project ID: {project_id}")
    print(f">> Studios loaded: {len(studios)}")

    if invalid:
        print(f">> Invalid lines ignored: {invalid}")

    print()

    username = input("Scratch username: ")
    password = getpass.getpass("Scratch password: ")

    print()
    info("Authenticating with Scratch...")

    try:
        session = sa.login(username, password)
    except Exception as exc:
        error(f"Authentication failed: {exc}")
        sys.exit(1)

    success("Signed in!")
    print()

    successful = []
    failed = []
    timeouts = []

    total = len(studios)

    for index, studio_id in enumerate(studios, start=1):
        info(
            f"Adding project to studio: "
            f"{index}/{total} ({studio_id})"
        )

        try:
            studio = session.connect_studio(studio_id)
            studio.add_project(int(project_id))

            successful.append(studio_id)
            success(f"Added to studio {studio_id}")

        except TimeoutError:
            timeouts.append(studio_id)

            warning(
                f"Timeout on studio {studio_id}, "
                f"waiting {RETRY_DELAY}s..."
            )

            time.sleep(RETRY_DELAY)

            try:
                studio = session.connect_studio(studio_id)
                studio.add_project(int(project_id))

                successful.append(studio_id)
                timeouts.remove(studio_id)

                success(
                    f"Retry succeeded for studio {studio_id}"
                )

            except Exception as exc:
                failed.append(studio_id)

                error(
                    f"Retry failed for studio {studio_id}: "
                    f"{exc}"
                )

        except Exception as exc:
            failed.append(studio_id)

            error(
                f"Failed to add to studio {studio_id}, "
                f"continuing..."
            )

        if index != total:
            time.sleep(REQUEST_DELAY)

    print()
    print(Fore.MAGENTA + "=" * 30)
    print(Fore.GREEN + "Finished!")
    print(Fore.MAGENTA + "=" * 30)

    print(f"Successful: {len(successful)}")
    print(f"Failed:     {len(failed)}")
    print(f"Timeout:    {len(timeouts)}")

    if failed:
        print()
        warning("Failed studios:")

        for studio_id in failed:
            print(f"  - {studio_id}")

    if timeouts:
        print()
        warning("Timed-out studios:")

        for studio_id in timeouts:
            print(f"  - {studio_id}")

    print()
    info("Refreshing Scratch API to confirm results...")

    confirmed = 0

    for studio_id in successful:
        try:
            studio = session.connect_studio(studio_id)

            projects = studio.projects(limit=100)

            if any(
                str(project.id) == project_id
                for project in projects
            ):
                confirmed += 1

        except Exception:
            pass

    if confirmed == len(successful):
        success(
            "Successfully confirmed all successful "
            "studio additions!"
        )
    else:
        warning(
            f"Confirmed {confirmed}/{len(successful)} "
            "successful additions."
        )

    print()
    print(
        "Thanks for using Scrapularizer! "
        "Hope your project gets popular! <3"
    )
    print("- Winverse")


if __name__ == "__main__":
    main()