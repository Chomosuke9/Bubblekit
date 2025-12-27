# You should edit this file if you are using built-in launcher.
# delete all content from this file and make your own server.
# more information in the documentation.
# TODO: Add documentation about this file.

from bubblekit import create_app

app = create_app()

class UneditedServerFile(Exception):
    pass

raise UneditedServerFile(
    """\n\n\n
    |================================================================|
    |Edit apps/server/main.py file first before running the launcher.|
    |================================================================|
    \n\n\n""")
