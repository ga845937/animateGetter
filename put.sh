docker rm animateGetter -f
docker rmi animategetter
docker build -t animategetter /projects/animateGetter
docker run -v /192.168.10.90:/192.168.10.90 -d -p 3003:3000 -e TZ=Asia/Taipei --name animateGetter --restart always animategetter
