FROM node:18
RUN mkdir -p /projects/animateGetter
COPY . /projects/animateGetter
WORKDIR /projects/animateGetter
ENV TZ=Asia/Taipei
RUN npm i pm2 -g
RUN npm i typescript -g
RUN npm i --production
RUN tsc
RUN cp -R /projects/animateGetter/src/views /projects/animateGetter/dist/views
RUN apt-get -y update && apt-get -y upgrade && apt-get install -y --no-install-recommends ffmpeg
EXPOSE 3000
CMD ["pm2-runtime", "dist/app.js"]
