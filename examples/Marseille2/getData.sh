# curl --user guest:guest ftp://forge-idi.ign.fr/iTowns/examples/Marseille/images_LR_Marseille.zip --remote-name
# jar images_LR_Marseille.zip

curl --user guest:guest ftp://forge-idi.ign.fr/iTowns/examples/Marseille/Marseille2-metadata.tar.gz --remote-name
tar -xvzf Marseille2-metadata.tar.gz
