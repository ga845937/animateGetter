FROM node:18
RUN mkdir -p /projects/animateGetter
COPY . /projects/animateGetter
WORKDIR /projects/animateGetter
ENV TZ=Asia/Taipei
RUN apt-get update \
	&& apt-get install -y wget gnupg \
	&& wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
	&& sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
	&& apt-get update \
	&& apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-khmeros fonts-kacst fonts-freefont-ttf libxss1 \
	  --no-install-recommends \
	&& apt-get install -y --no-install-recommends ffmpeg \
	&& rm -rf /var/lib/apt/lists/*
RUN npm i pm2 -g
RUN npm i typescript -g
RUN npm i
RUN tsc
RUN cp -R /projects/animateGetter/src/views /projects/animateGetter/dist/views
EXPOSE 3000
CMD ["pm2-runtime", "dist/app.js"]
