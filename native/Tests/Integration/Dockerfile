FROM alpine:3.22
RUN apk add --no-cache openssh-server curl busybox-extras && adduser -D ori
RUN { printf 'ori:'; head -c 32 /dev/urandom | base64; } | chpasswd
RUN mkdir -p /home/ori/.ssh /www && chmod 700 /home/ori/.ssh && echo ORI_SERVICE_OK > /www/index.html
COPY id_test.pub /home/ori/.ssh/authorized_keys
RUN chown -R ori:ori /home/ori/.ssh && chmod 600 /home/ori/.ssh/authorized_keys
RUN printf '%s\n' 'Port 2222' 'ListenAddress 0.0.0.0' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PermitRootLogin no' 'AllowTcpForwarding yes' 'GatewayPorts no' 'PermitTTY yes' 'UseDNS no' 'PidFile /tmp/sshd.pid' > /etc/ssh/sshd_config
CMD ["/bin/sh", "-c", "ssh-keygen -A >/dev/null 2>&1 && httpd -p 8080 -h /www && exec /usr/sbin/sshd -D -e"]
